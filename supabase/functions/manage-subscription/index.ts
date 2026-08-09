/* eslint-disable no-undef */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paddleFetch } from "../_shared/paddle-api.js";

const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("billing_subscription_id")
            .eq("id", user.id)
            .single();

        if (!profile?.billing_subscription_id) {
            return new Response(JSON.stringify({ error: "No subscription found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { action, newPlanId } = await req.json();
        if (!action) {
            return new Response(JSON.stringify({ error: "Missing action" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const subscriptionId = profile.billing_subscription_id;

        if (action === "cancel") {
            await paddleFetch(
                `subscriptions/${subscriptionId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        scheduled_change: {
                            effective_from: "next_billing_period",
                            action: "cancel",
                        },
                    }),
                },
                PADDLE_API_KEY
            );
        } else if (action === "change_plan") {
            if (!newPlanId) {
                return new Response(JSON.stringify({ error: "Missing newPlanId for change_plan" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            await paddleFetch(
                `subscriptions/${subscriptionId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        items: [{ price_id: newPlanId, quantity: 1 }],
                        scheduled_change: {
                            effective_from: "next_billing_period",
                            action: "update",
                        },
                    }),
                },
                PADDLE_API_KEY
            );
        } else {
            return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ success: true }), {
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
