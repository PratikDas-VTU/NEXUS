package org.nexus.mesh;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.Connections;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * NEXUS Native Mesh Bridge Plugin (Phase 6 — Step 5B.3 Real Implementation)
 *
 * Implements the Android-side native transport using Google Play Services Nearby Connections
 * with Strategy.P2P_CLUSTER.
 *
 * Strategy & Protocol Boundary:
 * - Strategy: Strategy.P2P_CLUSTER (M-to-N mesh-compatible local cluster).
 * - Service ID: 'nexus-mesh-v1' (deterministic identifier matching TypeScript DEFAULT_NEXUS_SERVICE_ID).
 * - Payload: UTF-8 JSON serialized RelayMessages via Payload.fromBytes() / Payload.asBytes().
 * - RelayEngine remains completely decoupled; this layer acts strictly as a byte/message pipe.
 */
@CapacitorPlugin(
    name = "NexusNative",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            }
        ),
        @Permission(
            alias = "nearby_wifi",
            strings = {
                "android.permission.NEARBY_WIFI_DEVICES"
            }
        ),
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class NexusNativePlugin extends Plugin {

    public static final String TAG = "NexusNativePlugin";

    /**
     * Deterministic service identifier derived from the NEXUS protocol namespace.
     * Matches DEFAULT_NEXUS_SERVICE_ID ('nexus-mesh-v1') in networking/nativeTransportProvider.ts.
     */
    public static final String DEFAULT_SERVICE_ID = "nexus-mesh-v1";

    /**
     * M-to-N cluster strategy for symmetric, infrastructure-less peer discovery.
     */
    public static final Strategy NEARBY_STRATEGY = Strategy.P2P_CLUSTER;

    /**
     * Maximum byte payload size allowed by Google Play Services Nearby Connections (32 KB).
     */
    public static final int MAX_PAYLOAD_BYTES = Connections.MAX_BYTES_DATA_SIZE;

    // Active state tracking
    private ConnectionsClient connectionsClient;
    private volatile boolean isAdvertising = false;
    private volatile boolean isDiscovering = false;
    private volatile String currentServiceId = DEFAULT_SERVICE_ID;

    // Discovered and connected endpoints bookkeeping
    private static class EndpointState {
        final String endpointId;
        final String endpointName;
        final String serviceId;
        volatile boolean isConnected;

        EndpointState(String endpointId, String endpointName, String serviceId) {
            this.endpointId = endpointId;
            this.endpointName = endpointName;
            this.serviceId = serviceId;
            this.isConnected = false;
        }
    }

    private final Map<String, EndpointState> discoveredEndpoints = new ConcurrentHashMap<>();
    private final Map<String, EndpointState> connectedEndpoints = new ConcurrentHashMap<>();

    // ─── CLIENT RETRIEVAL ───────────────────────────────────────────────────

    private synchronized ConnectionsClient getClient() {
        if (connectionsClient == null && getContext() != null) {
            connectionsClient = Nearby.getConnectionsClient(getContext());
        }
        return connectionsClient;
    }

    // ─── PERMISSIONS CHECKING ───────────────────────────────────────────────

    private List<String> getRequiredRuntimePermissions() {
        List<String> perms = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13+ (API 33+)
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
            perms.add("android.permission.NEARBY_WIFI_DEVICES");
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12/12L (API 31-32)
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
        } else { // Android 7.0 - 11 (API 24-30)
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        return perms;
    }

    private boolean hasNearbyRuntimePermissions() {
        Context ctx = getContext();
        if (ctx == null) return false;
        for (String perm : getRequiredRuntimePermissions()) {
            if (ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private List<String> getMissingPermissions() {
        Context ctx = getContext();
        if (ctx == null) return Collections.emptyList();
        List<String> missing = new ArrayList<>();
        for (String perm : getRequiredRuntimePermissions()) {
            if (ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED) {
                missing.add(perm);
            }
        }
        return missing;
    }

    private String[] getRequiredPermissionAliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] { "bluetooth", "nearby_wifi" };
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { "bluetooth" };
        } else {
            return new String[] { "location" };
        }
    }

    // ─── 1. AVAILABILITY PROBE ──────────────────────────────────────────────

    /**
     * Accurately reports whether the Nearby Connections transport is operational.
     * Checks Google Play Services, Bluetooth hardware, and runtime permissions.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("platform", "android");

        Context ctx = getContext();
        if (ctx == null) {
            ret.put("available", false);
            ret.put("status", "context_unavailable");
            call.resolve(ret);
            return;
        }

        // 1. Google Play Services availability
        GoogleApiAvailability apiAvailability = GoogleApiAvailability.getInstance();
        int resultCode = apiAvailability.isGooglePlayServicesAvailable(ctx);
        if (resultCode != ConnectionResult.SUCCESS) {
            ret.put("available", false);
            ret.put("status", "google_play_services_unavailable");
            ret.put("googlePlayServicesCode", resultCode);
            call.resolve(ret);
            return;
        }

        // 2. Bluetooth hardware availability
        BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();
        if (btAdapter == null) {
            ret.put("available", false);
            ret.put("status", "bluetooth_unsupported");
            call.resolve(ret);
            return;
        }

        // 3. Runtime permissions check
        List<String> missing = getMissingPermissions();
        if (!missing.isEmpty()) {
            ret.put("available", false);
            ret.put("status", "permissions_missing");
            ret.put("missingPermissions", String.join(", ", missing));
            call.resolve(ret);
            return;
        }

        // 4. Client availability verification
        try {
            ConnectionsClient client = getClient();
            if (client == null) {
                ret.put("available", false);
                ret.put("status", "nearby_client_unavailable");
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            ret.put("available", false);
            ret.put("status", "nearby_client_error: " + e.getMessage());
            call.resolve(ret);
            return;
        }

        ret.put("available", true);
        ret.put("status", "ready");
        ret.put("strategy", "P2P_CLUSTER");
        call.resolve(ret);
    }

    // ─── 2. ADVERTISING ─────────────────────────────────────────────────────

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (!hasNearbyRuntimePermissions()) {
            Log.i(TAG, "Requesting missing permissions for advertising...");
            requestPermissionForAliases(getRequiredPermissionAliases(), call, "startAdvertisingPermissionCallback");
            return;
        }
        executeStartAdvertising(call);
    }

    @PermissionCallback
    private void startAdvertisingPermissionCallback(PluginCall call) {
        if (hasNearbyRuntimePermissions()) {
            executeStartAdvertising(call);
        } else {
            call.reject("Required Nearby runtime permissions denied: " + String.join(", ", getMissingPermissions()));
        }
    }

    private void executeStartAdvertising(PluginCall call) {
        String deviceName = call.getString("deviceName");
        if (deviceName == null || deviceName.trim().isEmpty()) {
            deviceName = Build.MODEL != null ? Build.MODEL : "NEXUS-Node";
        }

        String serviceId = call.getString("serviceId");
        if (serviceId == null || serviceId.trim().isEmpty()) {
            serviceId = DEFAULT_SERVICE_ID;
        }
        this.currentServiceId = serviceId;

        ConnectionsClient client = getClient();
        if (client == null) {
            call.reject("Nearby ConnectionsClient unavailable");
            return;
        }

        if (isAdvertising) {
            Log.i(TAG, "Advertising already active for service: " + currentServiceId);
            call.resolve();
            return;
        }

        AdvertisingOptions advertisingOptions = new AdvertisingOptions.Builder()
            .setStrategy(NEARBY_STRATEGY)
            .build();

        final String finalDeviceName = deviceName;
        final String finalServiceId = serviceId;

        client.startAdvertising(finalDeviceName, finalServiceId, connectionLifecycleCallback, advertisingOptions)
            .addOnSuccessListener(unused -> {
                isAdvertising = true;
                Log.i(TAG, "Advertising started as '" + finalDeviceName + "' on " + finalServiceId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                isAdvertising = false;
                Log.e(TAG, "Failed to start advertising: " + e.getMessage(), e);
                call.reject("Failed to start advertising: " + e.getMessage());
            });
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        try {
            ConnectionsClient client = getClient();
            if (client != null) {
                client.stopAdvertising();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping advertising: " + e.getMessage());
        } finally {
            isAdvertising = false;
            call.resolve();
        }
    }

    // ─── 3. DISCOVERY ───────────────────────────────────────────────────────

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!hasNearbyRuntimePermissions()) {
            Log.i(TAG, "Requesting missing permissions for discovery...");
            requestPermissionForAliases(getRequiredPermissionAliases(), call, "startDiscoveryPermissionCallback");
            return;
        }
        executeStartDiscovery(call);
    }

    @PermissionCallback
    private void startDiscoveryPermissionCallback(PluginCall call) {
        if (hasNearbyRuntimePermissions()) {
            executeStartDiscovery(call);
        } else {
            call.reject("Required Nearby runtime permissions denied: " + String.join(", ", getMissingPermissions()));
        }
    }

    private void executeStartDiscovery(PluginCall call) {
        String serviceId = call.getString("serviceId");
        if (serviceId == null || serviceId.trim().isEmpty()) {
            serviceId = DEFAULT_SERVICE_ID;
        }
        this.currentServiceId = serviceId;

        ConnectionsClient client = getClient();
        if (client == null) {
            call.reject("Nearby ConnectionsClient unavailable");
            return;
        }

        if (isDiscovering) {
            Log.i(TAG, "Discovery already active for service: " + currentServiceId);
            call.resolve();
            return;
        }

        DiscoveryOptions discoveryOptions = new DiscoveryOptions.Builder()
            .setStrategy(NEARBY_STRATEGY)
            .build();

        final String finalServiceId = serviceId;

        client.startDiscovery(finalServiceId, endpointDiscoveryCallback, discoveryOptions)
            .addOnSuccessListener(unused -> {
                isDiscovering = true;
                Log.i(TAG, "Discovery started on service: " + finalServiceId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                isDiscovering = false;
                Log.e(TAG, "Failed to start discovery: " + e.getMessage(), e);
                call.reject("Failed to start discovery: " + e.getMessage());
            });
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        try {
            ConnectionsClient client = getClient();
            if (client != null) {
                client.stopDiscovery();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping discovery: " + e.getMessage());
        } finally {
            isDiscovering = false;
            call.resolve();
        }
    }

    // ─── 4. DISCOVERY CALLBACKS ─────────────────────────────────────────────

    private final EndpointDiscoveryCallback endpointDiscoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
            Log.i(TAG, "Endpoint found: " + endpointId + " (" + info.getEndpointName() + ") service: " + info.getServiceId());

            EndpointState state = new EndpointState(endpointId, info.getEndpointName(), info.getServiceId());
            discoveredEndpoints.put(endpointId, state);

            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("endpointName", info.getEndpointName());
            event.put("serviceId", info.getServiceId());
            notifyListeners("endpointFound", event);
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            Log.i(TAG, "Endpoint lost: " + endpointId);
            discoveredEndpoints.remove(endpointId);

            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            notifyListeners("endpointLost", event);
        }
    };

    // ─── 5. CONNECTION LIFECYCLE ────────────────────────────────────────────

    @PluginMethod
    public void connect(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId == null || endpointId.trim().isEmpty()) {
            call.reject("endpointId parameter is required");
            return;
        }

        ConnectionsClient client = getClient();
        if (client == null) {
            call.reject("Nearby ConnectionsClient unavailable");
            return;
        }

        if (connectedEndpoints.containsKey(endpointId)) {
            Log.i(TAG, "Endpoint " + endpointId + " is already connected");
            call.resolve();
            return;
        }

        String localName = Build.MODEL != null ? Build.MODEL : "NEXUS-Node";

        client.requestConnection(localName, endpointId, connectionLifecycleCallback)
            .addOnSuccessListener(unused -> {
                Log.i(TAG, "requestConnection sent to " + endpointId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                if (connectedEndpoints.containsKey(endpointId)) {
                    call.resolve();
                } else {
                    Log.w(TAG, "requestConnection failed to " + endpointId + ": " + e.getMessage());
                    call.reject("Connection request failed: " + e.getMessage());
                }
            });
    }

    private final ConnectionLifecycleCallback connectionLifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo connectionInfo) {
            Log.i(TAG, "Connection initiated from " + endpointId + " (" + connectionInfo.getEndpointName() + ")");

            EndpointState state = new EndpointState(endpointId, connectionInfo.getEndpointName(), currentServiceId);
            discoveredEndpoints.put(endpointId, state);

            // 1. Dispatch connectionInitiated event to Capacitor bridge
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("endpointName", connectionInfo.getEndpointName());
            event.put("serviceId", currentServiceId);
            if (connectionInfo.getAuthenticationDigits() != null) {
                event.put("authenticationToken", connectionInfo.getAuthenticationDigits());
            }
            notifyListeners("connectionInitiated", event);

            // 2. Deterministic Auto-Accept policy
            ConnectionsClient client = getClient();
            if (client != null) {
                client.acceptConnection(endpointId, payloadCallback)
                    .addOnSuccessListener(unused -> Log.i(TAG, "acceptConnection succeeded for " + endpointId))
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "acceptConnection failed for " + endpointId + ": " + e.getMessage());
                        JSObject res = new JSObject();
                        res.put("endpointId", endpointId);
                        res.put("status", "ERROR");
                        res.put("message", "Accept failed: " + e.getMessage());
                        notifyListeners("connectionResult", res);
                    });
            }
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution result) {
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);

            if (result.getStatus().isSuccess()) {
                Log.i(TAG, "Connection SUCCESS with " + endpointId);
                EndpointState state = discoveredEndpoints.get(endpointId);
                if (state == null) {
                    state = new EndpointState(endpointId, endpointId, currentServiceId);
                }
                state.isConnected = true;
                connectedEndpoints.put(endpointId, state);

                event.put("status", "CONNECTED");
                event.put("message", "Nearby connection established");
            } else {
                int statusCode = result.getStatus().getStatusCode();
                Log.w(TAG, "Connection failed with " + endpointId + ", code=" + statusCode);
                connectedEndpoints.remove(endpointId);

                event.put("status", "REJECTED");
                event.put("message", "Connection failed (status code " + statusCode + ")");
            }
            notifyListeners("connectionResult", event);
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            Log.i(TAG, "Endpoint disconnected: " + endpointId);
            connectedEndpoints.remove(endpointId);
            discoveredEndpoints.remove(endpointId);

            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("reason", "Remote peer or radio disconnected");
            notifyListeners("disconnected", event);
        }
    };

    // ─── 6. PAYLOAD PASSING ─────────────────────────────────────────────────

    @PluginMethod
    public void sendPayload(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String payloadString = call.getString("payload");

        if (endpointId == null || endpointId.trim().isEmpty()) {
            call.reject("endpointId parameter is required");
            return;
        }
        if (payloadString == null) {
            call.reject("payload parameter is required");
            return;
        }

        ConnectionsClient client = getClient();
        if (client == null) {
            call.reject("Nearby ConnectionsClient unavailable");
            return;
        }

        byte[] bytes = payloadString.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_PAYLOAD_BYTES) {
            String err = "Payload size (" + bytes.length + " bytes) exceeds Nearby Connections limit (" + MAX_PAYLOAD_BYTES + " bytes)";
            Log.e(TAG, err);
            call.reject(err);
            return;
        }

        Payload payload = Payload.fromBytes(bytes);
        client.sendPayload(endpointId, payload)
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(e -> {
                Log.e(TAG, "Failed to send payload to " + endpointId + ": " + e.getMessage());
                call.reject("Failed to send payload: " + e.getMessage());
            });
    }

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            if (payload.getType() == Payload.Type.BYTES) {
                byte[] bytes = payload.asBytes();
                if (bytes != null) {
                    String message = new String(bytes, StandardCharsets.UTF_8);
                    JSObject event = new JSObject();
                    event.put("endpointId", endpointId);
                    event.put("payload", message);
                    notifyListeners("payloadReceived", event);
                } else {
                    Log.w(TAG, "Received null byte array payload from " + endpointId);
                }
            } else {
                Log.w(TAG, "Received non-byte payload type (" + payload.getType() + ") from " + endpointId + " - ignored");
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate update) {
            if (update.getStatus() == PayloadTransferUpdate.Status.FAILURE) {
                Log.w(TAG, "Payload transfer failed for endpoint " + endpointId);
            }
        }
    };

    // ─── 7. DISCONNECTION ───────────────────────────────────────────────────

    @PluginMethod
    public void disconnect(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId != null && !endpointId.trim().isEmpty()) {
            try {
                ConnectionsClient client = getClient();
                if (client != null) {
                    client.disconnectFromEndpoint(endpointId);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error disconnecting from " + endpointId + ": " + e.getMessage());
            } finally {
                connectedEndpoints.remove(endpointId);
                discoveredEndpoints.remove(endpointId);

                JSObject event = new JSObject();
                event.put("endpointId", endpointId);
                event.put("reason", "Disconnected locally");
                notifyListeners("disconnected", event);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void disconnectAll(PluginCall call) {
        try {
            ConnectionsClient client = getClient();
            if (client != null) {
                client.stopAllEndpoints();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error stopping all endpoints: " + e.getMessage());
        } finally {
            for (String epId : connectedEndpoints.keySet()) {
                JSObject event = new JSObject();
                event.put("endpointId", epId);
                event.put("reason", "Disconnected all locally");
                notifyListeners("disconnected", event);
            }
            connectedEndpoints.clear();
            discoveredEndpoints.clear();
        }
        call.resolve();
    }

    // ─── 8. PLUGIN LIFECYCLE CLEANUP ────────────────────────────────────────

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        try {
            ConnectionsClient client = getClient();
            if (client != null) {
                if (isAdvertising) {
                    client.stopAdvertising();
                }
                if (isDiscovering) {
                    client.stopDiscovery();
                }
                client.stopAllEndpoints();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error during plugin destroy cleanup: " + e.getMessage());
        } finally {
            isAdvertising = false;
            isDiscovering = false;
            connectedEndpoints.clear();
            discoveredEndpoints.clear();
            connectionsClient = null;
        }
    }
}
