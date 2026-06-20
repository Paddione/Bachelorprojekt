package telemetry

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/log/global"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var tracer trace.Tracer
var logger otellog.Logger

// Init connects to the OTel Collector and initialises trace + log providers.
// Returns a shutdown function. On connection failure it returns fail-open (nil error, no-op shutdown).
func Init(ctx context.Context, endpoint string) (func(), error) {
	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: cannot connect to %s: %v (continuing without telemetry)\n", endpoint, err)
		return func() {}, nil
	}

	// Fail-open pattern: Create trace exporter, check for error before using it
	traceExp, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: trace exporter: %v\n", err)
		return func() {}, nil
	}
	// Only create and register TracerProvider if exporter creation succeeded
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(traceExp))
	otel.SetTracerProvider(tp)
	tracer = tp.Tracer("mcp-task-runner")

	logExp, err := otlploggrpc.New(ctx, otlploggrpc.WithGRPCConn(conn))
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: log exporter: %v (logs go to stderr only)\n", err)
	} else {
		lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)))
		global.SetLoggerProvider(lp)
		logger = lp.Logger("mcp-task-runner")
	}

	return func() { tp.Shutdown(ctx) }, nil //nolint:errcheck
}

// NewSpan creates a child span. Falls back to a no-op span if OTel is not initialised.
func NewSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	if tracer == nil {
		return ctx, trace.SpanFromContext(ctx)
	}
	return tracer.Start(ctx, name)
}

// EmitLog emits a structured log record. Falls back to stderr when logger is nil.
func EmitLog(ctx context.Context, body string, attrs ...attribute.KeyValue) {
	if logger == nil {
		fmt.Fprintln(os.Stderr, body)
		return
	}
	var r otellog.Record
	r.SetBody(otellog.StringValue(body))
	kvs := make([]otellog.KeyValue, len(attrs))
	for i, a := range attrs {
		kvs[i] = otellog.String(string(a.Key), a.Value.Emit())
	}
	r.AddAttributes(kvs...)
	logger.Emit(ctx, r)
}
