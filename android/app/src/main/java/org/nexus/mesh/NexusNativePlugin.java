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
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
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
    private volatile boolean shouldBeDiscovering = false;
    private volatile String currentServiceId = DEFAULT_SERVICE_ID;

    // In-flight connection handshakes tracking (for radio safety and dynamic discovery resume)
    private final java.util.Set<String> connectingEndpoints = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<String, Long> connectingTimestamps = new ConcurrentHashMap<>();

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
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12/12L (API 31-32)
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
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
            return new String[] { "bluetooth", "nearby_wifi", "location" };
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { "bluetooth", "location" };
        } else {
            return new String[] { "location" };
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (hasNearbyRuntimePermissions()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        Log.i(TAG, "[NEXUS][Nearby] Requesting runtime permissions from user...");
        requestPermissionForAliases(getRequiredPermissionAliases(), call, "genericPermissionsCallback");
    }

    @PermissionCallback
    private void genericPermissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = hasNearbyRuntimePermissions();
        ret.put("granted", granted);
        List<String> missing = getMissingPermissions();
        ret.put("missingPermissions", String.join(", ", missing));
        Log.i(TAG, "[NEXUS][Nearby] Permissions callback: granted=" + granted + (missing.isEmpty() ? "" : ", missing=" + String.join(", ", missing)));
        call.resolve(ret);
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

        // Diagnostic permission status breakdown
        JSObject diag = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            diag.put("bluetoothScan", ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED");
            diag.put("bluetoothConnect", ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED");
            diag.put("bluetoothAdvertise", ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED");
        } else {
            diag.put("bluetoothScan", "GRANTED");
            diag.put("bluetoothConnect", "GRANTED");
            diag.put("bluetoothAdvertise", "GRANTED");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            diag.put("nearbyWifi", ContextCompat.checkSelfPermission(ctx, "android.permission.NEARBY_WIFI_DEVICES") == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED");
        } else {
            diag.put("nearbyWifi", "NOT_REQUIRED");
        }
        diag.put("location", ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED");
        boolean hasWifiState = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_WIFI_STATE) == PackageManager.PERMISSION_GRANTED 
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.CHANGE_WIFI_STATE) == PackageManager.PERMISSION_GRANTED;
        diag.put("wifiState", hasWifiState ? "AVAILABLE" : "UNAVAILABLE");
        ret.put("diagnostics", diag);

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
            Log.i(TAG, "[NEXUS][Nearby] Advertising already active for service: " + currentServiceId);
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
                Log.i(TAG, "[NEXUS][Nearby] Advertising started as '" + finalDeviceName + "' on " + finalServiceId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                isAdvertising = false;
                Log.e(TAG, "[NEXUS][Nearby] Failed to start advertising: " + e.getMessage(), e);
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
            Log.w(TAG, "[NEXUS][Nearby] Error stopping advertising: " + e.getMessage());
        } finally {
            isAdvertising = false;
            Log.i(TAG, "[NEXUS][Nearby] Advertising stopped");
            call.resolve();
        }
    }

    // ─── 3. DISCOVERY ───────────────────────────────────────────────────────

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (!hasNearbyRuntimePermissions()) {
            Log.i(TAG, "[NEXUS][Nearby] Requesting missing permissions for discovery...");
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

        this.shouldBeDiscovering = true;

        if (isDiscovering) {
            Log.i(TAG, "[NEXUS][Nearby] Discovery already active for service: " + currentServiceId);
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
                Log.i(TAG, "[NEXUS][Nearby] Discovery started on service: " + finalServiceId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                isDiscovering = false;
                Log.e(TAG, "[NEXUS][Nearby] Failed to start discovery: " + e.getMessage(), e);
                call.reject("Failed to start discovery: " + e.getMessage());
            });
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        try {
            shouldBeDiscovering = false;
            connectingEndpoints.clear();
            connectingTimestamps.clear();
            ConnectionsClient client = getClient();
            if (client != null) {
                client.stopDiscovery();
            }
        } catch (Exception e) {
            Log.w(TAG, "[NEXUS][Nearby] Error stopping discovery: " + e.getMessage());
        } finally {
            isDiscovering = false;
            Log.i(TAG, "[NEXUS][Nearby] Discovery stopped");
            call.resolve();
        }
    }

    // ─── 4. DISCOVERY CALLBACKS ─────────────────────────────────────────────

    private final EndpointDiscoveryCallback endpointDiscoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
            Log.i(TAG, "[NEXUS][Nearby] Endpoint discovered: " + endpointId + " (" + info.getEndpointName() + ") service: " + info.getServiceId());

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
            Log.i(TAG, "[NEXUS][Nearby] Endpoint lost: " + endpointId);
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
            Log.i(TAG, "[NEXUS][Nearby] Endpoint " + endpointId + " is already connected");
            call.resolve();
            return;
        }

        String deviceName = call.getString("deviceName");
        if (deviceName == null || deviceName.trim().isEmpty()) {
            deviceName = Build.MODEL != null ? Build.MODEL : "NEXUS-Node";
        }
        final String localName = deviceName;

        connectingEndpoints.add(endpointId);
        connectingTimestamps.put(endpointId, System.currentTimeMillis());

        // Best Practice: Temporarily pause discovery during connection handshake
        // to free Bluetooth/Wi-Fi radio resources and prevent RF packet contention.
        if (isDiscovering) {
            try {
                Log.i(TAG, "[NEXUS][Nearby] Pausing discovery to facilitate connection handshake to " + endpointId);
                client.stopDiscovery();
            } catch (Exception e) {
                Log.w(TAG, "[NEXUS][Nearby] Failed to pause discovery before connect: " + e.getMessage());
            } finally {
                isDiscovering = false;
            }
        }

        Log.i(TAG, "[NEXUS][Nearby] Requesting connection to " + endpointId + " as '" + localName + "'");
        client.requestConnection(localName, endpointId, connectionLifecycleCallback)
            .addOnSuccessListener(unused -> {
                Log.i(TAG, "[NEXUS][Nearby] requestConnection successfully sent to " + endpointId);
                call.resolve();
            })
            .addOnFailureListener(e -> {
                connectingEndpoints.remove(endpointId);
                connectingTimestamps.remove(endpointId);
                resumeDiscoveryIfNecessary();

                String errMsg = e.getMessage() != null ? e.getMessage() : "";
                if (connectedEndpoints.containsKey(endpointId) || errMsg.contains("8003") || errMsg.contains("ALREADY_CONNECTED")) {
                    Log.i(TAG, "[NEXUS][Nearby] Endpoint " + endpointId + " is already connected or connecting: " + errMsg);
                    call.resolve();
                } else {
                    Log.w(TAG, "[NEXUS][Nearby] requestConnection failed to " + endpointId + ": " + errMsg);
                    call.reject("Connection request failed: " + errMsg);
                }
            });
    }

    private final ConnectionLifecycleCallback connectionLifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo connectionInfo) {
            Log.i(TAG, "[NEXUS][Nearby] Connection initiated: " + endpointId 
                + " (name=" + connectionInfo.getEndpointName() 
                + ", incoming=" + connectionInfo.isIncomingConnection()
                + ", auth=" + connectionInfo.getAuthenticationDigits() + ")");

            connectingEndpoints.add(endpointId);
            connectingTimestamps.put(endpointId, System.currentTimeMillis());

            // Also pause discovery on the receiving side if active to ensure the handshake has full radio bandwidth
            if (isDiscovering) {
                try {
                    ConnectionsClient client = getClient();
                    if (client != null) {
                        Log.i(TAG, "[NEXUS][Nearby] Pausing discovery on incoming connection handshake from " + endpointId);
                        client.stopDiscovery();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "[NEXUS][Nearby] Failed to pause discovery on connectionInitiated: " + e.getMessage());
                } finally {
                    isDiscovering = false;
                }
            }

            EndpointState state = new EndpointState(endpointId, connectionInfo.getEndpointName(), currentServiceId);
            discoveredEndpoints.put(endpointId, state);

            // 1. Dispatch connectionInitiated event to Capacitor bridge
            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("endpointName", connectionInfo.getEndpointName());
            event.put("serviceId", currentServiceId);
            event.put("isIncoming", connectionInfo.isIncomingConnection());
            if (connectionInfo.getAuthenticationDigits() != null) {
                event.put("authenticationToken", connectionInfo.getAuthenticationDigits());
            }
            notifyListeners("connectionInitiated", event);

            // 2. Deterministic Auto-Accept policy on both sides
            ConnectionsClient client = getClient();
            if (client != null) {
                client.acceptConnection(endpointId, payloadCallback)
                    .addOnSuccessListener(unused -> Log.i(TAG, "[NEXUS][Nearby] acceptConnection succeeded for " + endpointId))
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "[NEXUS][Nearby] acceptConnection failed for " + endpointId + ": " + e.getMessage());
                        connectingEndpoints.remove(endpointId);
                        connectingTimestamps.remove(endpointId);
                        resumeDiscoveryIfNecessary();

                        JSObject res = new JSObject();
                        res.put("endpointId", endpointId);
                        res.put("status", "ERROR");
                        res.put("statusCode", ConnectionsStatusCodes.STATUS_ERROR);
                        res.put("statusDescription", "STATUS_ERROR");
                        res.put("message", "Accept failed: " + e.getMessage());
                        notifyListeners("connectionResult", res);
                    });
            }
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution result) {
            connectingEndpoints.remove(endpointId);
            connectingTimestamps.remove(endpointId);

            int statusCode = result.getStatus().getStatusCode();
            String statusDesc = getStatusDescription(statusCode);
            String statusMsg = result.getStatus().getStatusMessage();

            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("statusCode", statusCode);
            event.put("statusDescription", statusDesc);

            if (result.getStatus().isSuccess()) {
                Log.i(TAG, "[NEXUS][Nearby] Connection result: SUCCESS (" + endpointId + ")");
                EndpointState state = discoveredEndpoints.get(endpointId);
                if (state == null) {
                    state = new EndpointState(endpointId, endpointId, currentServiceId);
                }
                state.isConnected = true;
                connectedEndpoints.put(endpointId, state);

                event.put("status", "CONNECTED");
                event.put("message", "Nearby connection established");
            } else {
                Log.w(TAG, "[NEXUS][Nearby] Connection result: FAILURE (" + endpointId + ", code=" + statusCode + " " + statusDesc + ")");
                connectedEndpoints.remove(endpointId);

                event.put("status", "REJECTED");
                event.put("message", "Connection failed: " + statusDesc + " (code " + statusCode + ")");
            }
            notifyListeners("connectionResult", event);

            // Dynamic Multi-Peer Mesh: Resume discovery once handshake completes so additional peers can join
            resumeDiscoveryIfNecessary();
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            Log.i(TAG, "[NEXUS][Nearby] Endpoint disconnected: " + endpointId);
            connectedEndpoints.remove(endpointId);
            discoveredEndpoints.remove(endpointId);
            connectingEndpoints.remove(endpointId);
            connectingTimestamps.remove(endpointId);

            JSObject event = new JSObject();
            event.put("endpointId", endpointId);
            event.put("reason", "Remote peer or radio disconnected");
            notifyListeners("disconnected", event);

            resumeDiscoveryIfNecessary();
        }
    };

    private String getStatusDescription(int statusCode) {
        switch (statusCode) {
            case 8000:
                return "STATUS_OK";
            case 8001:
                return "STATUS_INTERNAL_ERROR";
            case 8002:
                return "STATUS_NETWORK_NOT_CONNECTED";
            case 8003:
                return "STATUS_ALREADY_CONNECTED_TO_ENDPOINT";
            case 8004:
                return "STATUS_CONNECTION_REJECTED";
            case 8005:
                return "STATUS_NOT_CONNECTED_TO_ENDPOINT";
            case 8007:
                return "STATUS_BLUETOOTH_ERROR";
            case 8008:
                return "STATUS_ALREADY_HAVE_ACTIVE_STRATEGY";
            case 8009:
                return "STATUS_OUT_OF_ORDER_API_CALL";
            case 8010:
                return "STATUS_UNSUPPORTED_PAYLOAD_TYPE_FOR_STRATEGY";
            case 8011:
                return "STATUS_ENDPOINT_IO_ERROR";
            case 8012:
                return "STATUS_ENDPOINT_UNKNOWN";
            case 8013:
                return "STATUS_ALREADY_DISCOVERING";
            case 8014:
                return "STATUS_ALREADY_ADVERTISING";
            case 8015:
                return "STATUS_ERROR";
            case 8016:
                return "STATUS_PAYLOAD_IO_ERROR";
            default:
                return "STATUS_CODE_" + statusCode;
        }
    }

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
            .addOnSuccessListener(unused -> {
                Log.i(TAG, "[NEXUS][Nearby] Payload sent to " + endpointId + " (" + bytes.length + " bytes)");
                call.resolve();
            })
            .addOnFailureListener(e -> {
                Log.e(TAG, "[NEXUS][Nearby] Failed to send payload to " + endpointId + ": " + e.getMessage());
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
                    Log.i(TAG, "[NEXUS][Nearby] Payload received from: " + endpointId + " (" + bytes.length + " bytes)");
                    JSObject event = new JSObject();
                    event.put("endpointId", endpointId);
                    event.put("payload", message);
                    notifyListeners("payloadReceived", event);
                } else {
                    Log.w(TAG, "[NEXUS][Nearby] Received null byte array payload from " + endpointId);
                }
            } else {
                Log.w(TAG, "[NEXUS][Nearby] Received non-byte payload type (" + payload.getType() + ") from " + endpointId + " - ignored");
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate update) {
            if (update.getStatus() == PayloadTransferUpdate.Status.FAILURE) {
                Log.w(TAG, "[NEXUS][Nearby] Payload transfer failed for endpoint " + endpointId);
            }
        }
    };

    // ─── 7. DISCONNECTION ───────────────────────────────────────────────────

    @PluginMethod
    public void disconnect(PluginCall call) {
        String endpointId = call.getString("endpointId");
        if (endpointId != null && !endpointId.trim().isEmpty()) {
            Log.i(TAG, "[NEXUS][Nearby] Disconnecting from " + endpointId);
            try {
                ConnectionsClient client = getClient();
                if (client != null) {
                    client.disconnectFromEndpoint(endpointId);
                }
            } catch (Exception e) {
                Log.w(TAG, "[NEXUS][Nearby] Error disconnecting from " + endpointId + ": " + e.getMessage());
            } finally {
                connectedEndpoints.remove(endpointId);
                discoveredEndpoints.remove(endpointId);
                connectingEndpoints.remove(endpointId);
                connectingTimestamps.remove(endpointId);

                JSObject event = new JSObject();
                event.put("endpointId", endpointId);
                event.put("reason", "Disconnected locally");
                notifyListeners("disconnected", event);

                resumeDiscoveryIfNecessary();
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void disconnectAll(PluginCall call) {
        try {
            shouldBeDiscovering = false;
            connectingEndpoints.clear();
            connectingTimestamps.clear();
            ConnectionsClient client = getClient();
            if (client != null) {
                client.stopAllEndpoints();
            }
        } catch (Exception e) {
            Log.w(TAG, "[NEXUS][Nearby] Error stopping all endpoints: " + e.getMessage());
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

    /**
     * Resumes Nearby discovery if discovery was active and all in-flight handshakes have completed.
     * Prevents permanent discovery failure in multi-peer cluster meshes.
     */
    private synchronized void resumeDiscoveryIfNecessary() {
        if (!shouldBeDiscovering) {
            return;
        }

        // Clean up stale handshakes (> 25 seconds) to prevent permanent discovery deadlocks
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Long> entry : connectingTimestamps.entrySet()) {
            if (now - entry.getValue() > 25000) {
                Log.w(TAG, "[NEXUS][Nearby] Cleaning up stale handshake for " + entry.getKey());
                connectingEndpoints.remove(entry.getKey());
                connectingTimestamps.remove(entry.getKey());
            }
        }

        if (!connectingEndpoints.isEmpty()) {
            Log.i(TAG, "[NEXUS][Nearby] Discovery resume deferred: " + connectingEndpoints.size() + " handshake(s) in progress (" + connectingEndpoints + ")");
            return;
        }

        if (isDiscovering) {
            return;
        }

        ConnectionsClient client = getClient();
        if (client == null || !hasNearbyRuntimePermissions()) {
            Log.w(TAG, "[NEXUS][Nearby] Cannot resume discovery: client or permissions unavailable");
            return;
        }

        DiscoveryOptions discoveryOptions = new DiscoveryOptions.Builder()
            .setStrategy(NEARBY_STRATEGY)
            .build();

        final String finalServiceId = currentServiceId;
        Log.i(TAG, "[NEXUS][Nearby] Resuming Nearby discovery on service: " + finalServiceId);

        client.startDiscovery(finalServiceId, endpointDiscoveryCallback, discoveryOptions)
            .addOnSuccessListener(unused -> {
                isDiscovering = true;
                Log.i(TAG, "[NEXUS][Nearby] Nearby discovery successfully resumed on service: " + finalServiceId);
            })
            .addOnFailureListener(e -> {
                isDiscovering = false;
                Log.w(TAG, "[NEXUS][Nearby] Failed to resume Nearby discovery: " + e.getMessage(), e);
            });
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
            shouldBeDiscovering = false;
            isAdvertising = false;
            isDiscovering = false;
            connectingEndpoints.clear();
            connectingTimestamps.clear();
            connectedEndpoints.clear();
            discoveredEndpoints.clear();
            connectionsClient = null;
        }
    }
}
