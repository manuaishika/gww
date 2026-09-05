CREATE TABLE "news_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"event_date" date NOT NULL,
	"kind" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "news_events_symbol_date_idx" ON "news_events" USING btree ("symbol","event_date");