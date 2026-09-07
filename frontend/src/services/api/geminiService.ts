/**
 * NEXUS — Gemini 3.5 AI Emergency & Geolocation Service
 * 
 * Leverages Google Gemini 3.5 Flash Lite for:
 * 1. AI Emergency Triage & Incident Classification
 * 2. Natural Language Location & Landmark Geocoding
 * 3. Graceful offline fallback when Internet connectivity is unavailable
 */

import type { IncidentType, IncidentPriority } from '../../../../shared/types';

// Retrieve Gemini API Key from environment or local cache
export function getGeminiApiKey(): string {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) {
    return (import.meta as any).env.VITE_GEMINI_API_KEY;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('nexus_gemini_api_key') || '';
  }
  return '';
}

// Verified active model endpoint
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export function getGeminiEndpoint(): string {
  const key = getGeminiApiKey();
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

export interface GeminiParsedIncident {
  type: IncidentType;
  priority: IncidentPriority;
  latitude?: number;
  longitude?: number;
  landmarkName?: string;
  peopleAffected?: number;
  summary: string;
}

/** Known Tactical Reference Landmarks (Amrita Vengal Campus & Vicinity) */
export const CAMPUS_LANDMARKS: Record<string, { lat: number; lng: number; label: string }> = {
  main_gate: { lat: 13.2384, lng: 80.0094, label: 'Amrita Main Entrance Gate' },
  academic_block1: { lat: 13.2392, lng: 80.0102, label: 'Academic Block 1 (Engineering)' },
  library: { lat: 13.2378, lng: 80.0086, label: 'Central Library & Auditorium' },
  cafeteria: { lat: 13.2369, lng: 80.0098, label: 'Student Cafeteria & Food Court' },
  hostel_hub: { lat: 13.2358, lng: 80.0112, label: 'Hostel Complex & Medical Clinic' },
  sports_ground: { lat: 13.2401, lng: 80.0078, label: 'Sports Complex / Open Field' },
};

/**
 * Checks if the device has an active internet connection to contact Gemini.
 */
export function isOnlineForGemini(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : false;
}

/**
 * Validates the Gemini API key by making a minimal generation request.
 */
export async function testGeminiApiKey(): Promise<{ success: boolean; message: string }> {
  try {
    const key = getGeminiApiKey();
    if (!key) {
      return { success: false, message: 'Gemini API key not configured. Add VITE_GEMINI_API_KEY in .env.' };
    }

    if (!isOnlineForGemini()) {
      return { success: false, message: 'Device is currently offline. Gemini requires internet gateway.' };
    }

    const payload = {
      contents: [
        {
          parts: [{ text: 'Respond with OK in 1 word.' }],
        },
      ],
    };

    const response = await fetch(getGeminiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { success: true, message: 'Gemini 3.5 AI Engine online & authenticated.' };
    } else {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        message: err.error?.message || `API error ${response.status}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error contacting Gemini API.',
    };
  }
}

/**
 * Uses Gemini to parse freeform emergency text into structured incident data
 * with predicted category, priority, and estimated landmark coordinates.
 */
export async function parseEmergencyWithGemini(
  description: string
): Promise<GeminiParsedIncident | null> {
  if (!description || description.trim().length === 0) return null;
  if (!getGeminiApiKey()) return null;
  if (!isOnlineForGemini()) return null;

  const prompt = `You are NEXUS Disaster Command AI. Analyze this emergency situation report:
"${description.trim()}"

Reference campus location coordinates: Amrita Vishwa Vidyapeetham, Vengal, Chennai (Base: 13.2384, 80.0094).

Respond ONLY with a valid JSON object matching this exact schema:
{
  "type": "medical" | "fire" | "flood" | "hazard" | "rescue" | "supplies",
  "priority": "P0" | "P1" | "P2",
  "latitude": number (estimate around 13.2384 or matching specific landmark mentioned),
  "longitude": number (estimate around 80.0094 or matching specific landmark mentioned),
  "landmarkName": string (e.g. "Main Gate", "Block 1", "Library"),
  "peopleAffected": number (integer >= 1),
  "summary": string (clean concise 1-sentence situational summary)
}`;

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(getGeminiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    const cleanJson = candidateText.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      type: (['medical', 'fire', 'flood', 'hazard', 'rescue', 'supplies'].includes(parsed.type)
        ? parsed.type
        : 'medical') as IncidentType,
      priority: (['P0', 'P1', 'P2'].includes(parsed.priority) ? parsed.priority : 'P1') as IncidentPriority,
      latitude: typeof parsed.latitude === 'number' ? parsed.latitude : 13.2384,
      longitude: typeof parsed.longitude === 'number' ? parsed.longitude : 80.0094,
      landmarkName: parsed.landmarkName || 'Campus Zone',
      peopleAffected: typeof parsed.peopleAffected === 'number' && parsed.peopleAffected >= 1 ? parsed.peopleAffected : 1,
      summary: parsed.summary || description.slice(0, 100),
    };
  } catch (e) {
    console.warn('[GeminiService] AI parsing failed or fell back to offline default:', e);
    return null;
  }
}
