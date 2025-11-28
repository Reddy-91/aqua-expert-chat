import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const BACKEND_URL = Deno.env.get("BACKEND_URL");
    const BACKEND_USERNAME = Deno.env.get("BACKEND_USERNAME");
    const BACKEND_PASSWORD = Deno.env.get("BACKEND_PASSWORD");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch data from backend server (MGM application)
    let backendData = "";
    try {
      const credentials = btoa(`${BACKEND_USERNAME}:${BACKEND_PASSWORD}`);
      const baseUrl = BACKEND_URL!.replace('/login.jsp', '');
      
      // Fetch data from multiple MGM modules
      const modules = ['Customer', 'Product', 'Order', 'Inventory'];
      const modulePromises = modules.map(async (moduleName, index) => {
        const url = `${baseUrl}/index?applicationCode=mgm&category=none&moduleName=${moduleName}&moduleIndex=${index + 1}`;
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${credentials}`,
            },
          });
          if (response.ok) {
            const data = await response.text();
            return `\n### ${moduleName} Module Data:\n${data}`;
          }
          return `\n### ${moduleName} Module: Not available`;
        } catch (err) {
          console.error(`Error fetching ${moduleName}:`, err);
          return `\n### ${moduleName} Module: Error fetching data`;
        }
      });

      const moduleResults = await Promise.all(modulePromises);
      backendData = `\n\nHere is relevant data from the MGM database:\n${moduleResults.join('\n')}`;
      console.log("Successfully fetched backend data from MGM modules");
    } catch (backendError) {
      console.error("Error fetching backend data:", backendError);
      backendData = "\n\nNote: Unable to retrieve backend data at this time.";
    }

    const systemPrompt = `You are an expert chatbot specializing exclusively in aquaculture. Your knowledge covers all aspects of aquaculture, including fish and shrimp farming, pond management, water quality, feed, disease management, harvesting, and aquaculture technology.

Rules:
- Only provide answers related to aquaculture. If a question is outside aquaculture, politely say: "I can only answer questions about aquaculture."
- Answer in a clear, concise, and practical manner. Include examples or calculations if relevant.
- You may ask clarifying questions if needed to give precise answers.
- Always assume the person asking is seeking actionable guidance or advice.
- Use the provided database data to give accurate, data-driven answers when relevant.${backendData}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});