import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. The assistant will not be able to connect to the AI.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || 'MISSING_API_KEY' });
  }
  return aiInstance;
}

export interface NovaAction {
  type: 'SPEAK' | 'SYSTEM_COMMAND' | 'OPEN_APP' | 'CALL_CONTACT';
  text?: string;
  command?: string;
  target?: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface NovaResponse {
  actions: NovaAction[];
  groundingChunks?: GroundingChunk[];
}

export async function getNovaResponse(transcript: string, language: string = 'en-US'): Promise<NovaResponse> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are Nova, a highly intelligent, fast, and scalable voice-controlled personal assistant.
      
      You have access to real-time information via Google Search. If the user asks about the weather, current events, or facts, use your search capabilities to provide an accurate, up-to-date answer.
      
      Analyze the user's input and determine the best sequence of actions. 
      Respond ONLY with a valid JSON object matching this structure:
      {
        "actions": [
          {
            "type": "SPEAK" | "SYSTEM_COMMAND" | "OPEN_APP" | "CALL_CONTACT",
            "text": "The conversational response to speak back to the user (if applicable)",
            "command": "The system command to execute (e.g., 'WIFI_ON', 'WIFI_OFF', 'DARK_MODE_ON', 'DARK_MODE_OFF', 'CAMERA_OPEN') (if applicable)",
            "target": "The name of the app, website, or contact to interact with (e.g., 'youtube', 'whatsapp', 'My Home') (if applicable)"
          }
        ]
      }

      Rules:
      1. You can return multiple actions if the user asks to do multiple things (e.g., "Turn on WiFi and open YouTube" -> SYSTEM_COMMAND(WIFI_ON) + OPEN_APP(youtube)).
      2. If the user asks a general question, asks for the weather, or makes conversation, include a "SPEAK" action with the answer in the "text" field. Keep the spoken response concise and conversational.
      3. For system commands, use recognizable strings like 'WIFI_ON', 'WIFI_OFF', 'DARK_MODE_ON', 'DARK_MODE_OFF', 'CAMERA_OPEN'.
      4. If the user asks to open an app or website (e.g., "Open YouTube"), use type "OPEN_APP", set "target" to the app name/URL, and set "text" to something like "Opening YouTube".
      5. If the user asks to call someone (e.g., "Call my home", "Call John"), use type "CALL_CONTACT", set "target" to the person's name (e.g., "my home", "John"), and set "text" to something like "Calling my home".
      6. CRITICAL: The user is speaking in the language code "${language}". You MUST respond in this language. If the language is 'mr-IN', you must respond in Marathi.
      
      User Input: "${transcript}"`,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || '{"actions": []}';
    const parsed = JSON.parse(text) as NovaResponse;
    
    // Extract grounding chunks if they exist
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      parsed.groundingChunks = chunks as GroundingChunk[];
    }
    
    return parsed;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    let errorMessage = "I'm sorry, I'm having trouble connecting to my neural network right now.";
    
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('api key') || msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
        errorMessage = "There seems to be an issue with my API key. Please check your configuration.";
      } else if (msg.includes('quota') || msg.includes('429') || msg.includes('exhausted')) {
        errorMessage = "I've reached my usage limit for now. Please try again later.";
      } else if (msg.includes('offline') || msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        errorMessage = "I'm having trouble connecting to the internet. Please check your network connection.";
      } else if (msg.includes('safety') || msg.includes('blocked') || msg.includes('prohibited')) {
        errorMessage = "I cannot process that request due to safety restrictions.";
      } else if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) {
        errorMessage = "My servers are currently overloaded. Please try again in a moment.";
      } else {
        // Fallback to a slightly more specific error if it's not a known category
        errorMessage = `I encountered an error: ${error.message.split('\n')[0]}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = `I encountered an error: ${error}`;
    }

    return {
      actions: [{
        type: 'SPEAK',
        text: errorMessage
      }]
    };
  }
}
