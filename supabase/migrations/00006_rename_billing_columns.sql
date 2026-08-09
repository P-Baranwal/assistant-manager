-- Migration: Rename Stripe-specific billing columns to vendor-agnostic names
-- Part of Stripe → Paddle migration

ALTER TABLE public.profiles RENAME COLUMN stripe_customer_id TO billing_customer_id;
ALTER TABLE public.profiles RENAME COLUMN stripe_subscription_id TO billing_subscription_id;
