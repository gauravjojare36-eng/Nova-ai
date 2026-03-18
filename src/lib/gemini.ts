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
    const apiKey = process.env.OPENROUTER_API_KEY || (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_OPENROUTER_API_KEY : '');
    
    if (!apiKey) {
      throw new Error("API_KEY_MISSING");
    }

    const systemPrompt = `You are Nova, a highly intelligent, fast, and scalable voice-controlled personal assistant.
      
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
      6. CRITICAL: The user is speaking in the language code "${language}". You MUST respond in this language. If the language is 'mr-IN', you must respond in Marathi.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.href : "https://nova-ai.com",
        "X-Title": "Nova AI",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash", // Using Gemini via OpenRouter
        "response_format": { "type": "json_object" },
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": transcript }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP Error ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices[0]?.message?.content || '{"actions": []}';
    
    // Clean up markdown code blocks if the model accidentally includes them
    const cleanText = text.replace(/^\s*```json\s*/, '').replace(/\s*```\s*$/, '');
    
    const parsed = JSON.parse(cleanText) as NovaResponse;
    return parsed;
    
  } catch (error: any) {
    console.error("OpenRouter API Error:", error);
    
    let errorMessage = "I'm sorry, I'm having trouble connecting to my neural network right now.";
    
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg === 'api_key_missing') {
        errorMessage = "There seems to be an issue with my OpenRouter API key. Please check your Vercel configuration.";
      } else if (msg.includes('api key') || msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
        errorMessage = "My OpenRouter API key was rejected. Please check your configuration.";
      } else if (msg.includes('quota') || msg.includes('429') || msg.includes('limit') || msg.includes('insufficient_quota')) {
        errorMessage = "I've reached my OpenRouter usage limit or run out of credits. Please check your OpenRouter account.";
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
