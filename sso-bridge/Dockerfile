FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /sso-bridge .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /sso-bridge /sso-bridge
EXPOSE 8180
ENTRYPOINT ["/sso-bridge"]
