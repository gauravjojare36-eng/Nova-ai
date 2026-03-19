import { GoogleGenAI, Type } from "@google/genai";

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
    // @ts-ignore - Handle both Vite's import.meta.env and statically replaced process.env
    const apiKey = process.env.GEMINI_API_KEY || (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '');
    
    if (!apiKey) {
      throw new Error("API_KEY_MISSING");
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Nova, a highly intelligent, fast, and scalable voice-controlled personal assistant.
      
      Analyze the user's input and determine the best sequence of actions. 
      
      Rules:
      1. You can return multiple actions if the user asks to do multiple things (e.g., "Turn on WiFi and open YouTube" -> SYSTEM_COMMAND(WIFI_ON) + OPEN_APP(youtube)).
      2. If the user asks a general question, asks for the weather, or makes conversation, include a "SPEAK" action with the answer in the "text" field. Keep the spoken response concise and conversational.
      3. For system commands, use recognizable strings like 'WIFI_ON', 'WIFI_OFF', 'DARK_MODE_ON', 'DARK_MODE_OFF', 'CAMERA_OPEN'.
      4. If the user asks to open an app or website (e.g., "Open YouTube"), use type "OPEN_APP", set "target" to the app name/URL, and set "text" to something like "Opening YouTube".
      5. If the user asks to call someone (e.g., "Call my home", "Call John"), use type "CALL_CONTACT", set "target" to the person's name (e.g., "my home", "John"), and set "text" to something like "Calling my home".
      6. CRITICAL: The user is speaking in the language code "${language}". You MUST respond in this language. If the language is 'mr-IN', you must respond in Marathi.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: transcript,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "The type of action: SPEAK, SYSTEM_COMMAND, OPEN_APP, or CALL_CONTACT"
                  },
                  text: {
                    type: Type.STRING,
                    description: "The conversational response to speak back to the user"
                  },
                  command: {
                    type: Type.STRING,
                    description: "The system command to execute (e.g., WIFI_ON)"
                  },
                  target: {
                    type: Type.STRING,
                    description: "The name of the app, website, or contact"
                  }
                },
                required: ["type"]
              }
            }
          },
          required: ["actions"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }
    
    const parsed = JSON.parse(text) as NovaResponse;
    return parsed;
    
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    let errorMessage = "I'm sorry, I'm having trouble connecting to my neural network right now.";
    
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg === 'api_key_missing') {
        errorMessage = "There seems to be an issue with my API key. Please check your Vercel configuration.";
      } else if (msg.includes('api key') || msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
        errorMessage = "My API key was rejected. Please check your configuration.";
      } else if (msg.includes('quota') || msg.includes('429') || msg.includes('limit') || msg.includes('insufficient_quota')) {
        errorMessage = "I've reached my usage limit for now. Please try again later.";
      } else if (msg.includes('offline') || msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        errorMessage = "I'm having trouble connecting to the internet. Please check your network connection.";
      } else {
        errorMessage = `I encountered an error: ${error.message.split('\n')[0]}`;
      }
    }

    return {
      actions: [{
        type: 'SPEAK',
        text: errorMessage
      }]
    };
  }
}
