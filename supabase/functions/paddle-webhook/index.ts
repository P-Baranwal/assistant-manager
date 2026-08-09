/* eslint-disable no-undef */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPaddleWebhook } from "../_shared/paddle-api.js";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

const PRICE_TO_TIER = {
    [Deno.env.get("PADDLE_PRICE_STUDENT") || ""]: "student",
    [Deno.env.get("PADDLE_PRICE_STUDENT_MONTHLY") || ""]: "student",
    [Deno.env.get("PADDLE_PRICE_STUDENT_YEARLY") || ""]: "student",
    [Deno.env.get("PADDLE_PRICE_PRO") || ""]: "pro",
    [Deno.env.get("PADDLE_PRICE_PRO_MONTHLY") || ""]: "pro",
    [Deno.env.get("PADDLE_PRICE_PRO_YEARLY") || ""]: "pro",
    [Deno.env.get("PADDLE_PRICE_TEAM") || ""]: "team",
};

serve(async (req) => {
    try {
        const body = await req.text();
        const signature = req.headers.get("Paddle-Signature");

        const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET");
        if (!webhookSecret) throw new Error("PADDLE_WEBHOOK_SECRET not set");

        const verified = await verifyPaddleWebhook(body, signature, webhookSecret);
        if (!verified) {
            return new Response(JSON.stringify({ error: "Invalid signature" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const event = JSON.parse(body);
        const eventType = event.event_type;

        switch (eventType) {
            case "subscription.created": {
                const subscription = event.data;
                const userId = subscription.custom_data?.supabase_user_id;
                if (!userId) break;

                const priceId = subscription.items?.[0]?.price_id;
                const tier = PRICE_TO_TIER[priceId] || "free";

                await supabase
                    .from("profiles")
                    .update({
                        billing_customer_id: subscription.customer_id,
                        billing_subscription_id: subscription.id,
                        subscription: tier,
                        subscription_status: subscription.status,
                        current_period_end: subscription.next_billed_at
                            || subscription.current_billing_period?.ends_at
                            || null,
                    })
                    .eq("id", userId);
                break;
            }

            case "subscription.updated": {
                const subscription = event.data;
                const priceId = subscription.items?.[0]?.price_id;
                const tier = PRICE_TO_TIER[priceId] || "free";

                await supabase
                    .from("profiles")
                    .update({
                        subscription: tier,
                        subscription_status: subscription.status,
                        current_period_end: subscription.next_billed_at
                            || subscription.current_billing_period?.ends_at
                            || null,
                    })
                    .eq("billing_subscription_id", subscription.id);
                break;
            }

            case "subscription.canceled": {
                const subscription = event.data;

                await supabase
                    .from("profiles")
                    .update({
                        subscription: "free",
                        subscription_status: "canceled",
                        billing_subscription_id: null,
                    })
                    .eq("billing_subscription_id", subscription.id);
                break;
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
});
