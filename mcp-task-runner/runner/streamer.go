package runner

import (
	"bufio"
	"context"
	"io"
	"strings"

	"go.opentelemetry.io/otel/attribute"

	"github.com/paddione/mcp-task-runner/telemetry"
)

// streamLines reads lines from r, emits each as an OTel log record, and returns full output.
func streamLines(ctx context.Context, r io.Reader, stream string, base []attribute.KeyValue) string {
	attrs := make([]attribute.KeyValue, len(base)+1)
	copy(attrs, base)
	attrs[len(base)] = attribute.String("stream", stream)
	var sb strings.Builder
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		line := sc.Text()
		sb.WriteString(line + "\n")
		telemetry.EmitLog(ctx, line, attrs...)
	}
	return sb.String()
}
