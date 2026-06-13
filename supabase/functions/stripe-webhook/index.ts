import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
    apiVersion: "2024-06-20",
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

// Map Stripe price IDs to subscription tiers
const PRICE_TO_TIER = {
    [Deno.env.get("STRIPE_PRICE_STUDENT") || "price_student"]: "student",
    [Deno.env.get("STRIPE_PRICE_PRO") || "price_pro"]: "pro",
    [Deno.env.get("STRIPE_PRICE_TEAM") || "price_team"]: "team",
};

serve(async (req) => {
    try {
        const body = await req.text();
        const sig = req.headers.get("stripe-signature");

        const event = stripe.webhooks.constructEvent(
            body,
            sig,
            Deno.env.get("STRIPE_WEBHOOK_SECRET")
        );

        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const userId = session.metadata?.supabase_user_id;
                if (!userId) break;

                const subscription = await stripe.subscriptions.retrieve(
                    session.subscription
                );

                const priceId = subscription.items.data[0]?.price.id;
                const tier = PRICE_TO_TIER[priceId] || "free";

                await supabase
                    .from("profiles")
                    .update({
                        stripe_customer_id: session.customer,
                        stripe_subscription_id: subscription.id,
                        subscription: tier,
                        subscription_status: subscription.status,
                        current_period_end: new Date(
                            subscription.current_period_end * 1000
                        ).toISOString(),
                    })
                    .eq("id", userId);
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object;
                const priceId = subscription.items.data[0]?.price.id;
                const tier = PRICE_TO_TIER[priceId] || "free";

                await supabase
                    .from("profiles")
                    .update({
                        subscription: tier,
                        subscription_status: subscription.status,
                        current_period_end: new Date(
                            subscription.current_period_end * 1000
                        ).toISOString(),
                    })
                    .eq("stripe_subscription_id", subscription.id);
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object;

                await supabase
                    .from("profiles")
                    .update({
                        subscription: "free",
                        subscription_status: "canceled",
                        stripe_subscription_id: null,
                    })
                    .eq("stripe_subscription_id", subscription.id);
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
