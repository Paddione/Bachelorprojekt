FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /billing-bot .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /billing-bot /billing-bot
EXPOSE 8090
ENTRYPOINT ["/billing-bot"]
