import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
    apiVersion: "2024-06-20",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { priceId } = await req.json();
        if (!priceId) {
            return new Response(JSON.stringify({ error: "Missing priceId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Get or create Stripe customer
        const { data: profile } = await supabase
            .from("profiles")
            .select("stripe_customer_id, email")
            .eq("id", user.id)
            .single();

        let customerId = profile?.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { supabase_user_id: user.id },
            });
            customerId = customer.id;

            await supabase
                .from("profiles")
                .update({ stripe_customer_id: customerId })
                .eq("id", user.id);
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${appUrl}?checkout=success`,
            cancel_url: `${appUrl}?checkout=cancelled`,
            metadata: { supabase_user_id: user.id },
        });

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
