CREATE TABLE "bars_daily" (
	"symbol" text NOT NULL,
	"session_date" date NOT NULL,
	"open" numeric,
	"high" numeric,
	"low" numeric,
	"close" numeric,
	"adj_close" numeric,
	"volume" numeric,
	CONSTRAINT "bars_daily_symbol_session_date_pk" PRIMARY KEY("symbol","session_date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"detector" text NOT NULL,
	"session_date" date NOT NULL,
	"dedupe_key" text NOT NULL,
	"score" numeric,
	"z" numeric,
	"payload" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "quotes_latest" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" numeric,
	"prev_close" numeric,
	"exchange_ts" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"source" text,
	"is_disputed" boolean DEFAULT false NOT NULL,
	"dispute_note" text,
	"circuit_state" text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_daily" (
	"symbol" text PRIMARY KEY NOT NULL,
	"sigma_60" numeric,
	"beta_60" numeric,
	"resid_sigma_60" numeric,
	"vol_median_30" numeric,
	"vol_mad_30" numeric,
	"high_252" numeric,
	"low_252" numeric,
	"sessions_available" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exchange" text DEFAULT 'NSE' NOT NULL,
	"sector" text,
	"listed_on" date,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_event_state" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text,
	"acted_at" timestamp with time zone,
	CONSTRAINT "user_event_state_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "user_symbol_state" (
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_seen_price" numeric,
	CONSTRAINT "user_symbol_state_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_account_code_unique" UNIQUE("account_code")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thesis" text,
	"muted_until" timestamp with time zone,
	CONSTRAINT "watchlist_items_user_symbol" UNIQUE("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_symbol_symbols_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."symbols"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_symbol_idx" ON "events" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "events_detected_at_idx" ON "events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "watchlist_items_user_idx" ON "watchlist_items" USING btree ("user_id");