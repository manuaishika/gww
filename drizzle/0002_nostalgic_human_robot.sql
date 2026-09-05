ALTER TABLE "symbols" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "benchmark_symbol" text DEFAULT 'NIFTY50' NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "position_size" numeric;