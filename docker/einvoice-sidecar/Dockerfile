# syntax=docker/dockerfile:1
FROM maven:3.10-eclipse-temurin-21@sha256:9b4877723dadf350b452dd97d9a6401e7b56f98fa9dfe420c32ad909989c7e4c AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:25-jre@sha256:fd4b1c02c64eef378212e23656fc0b0caa41a357876fa0b60e51ceda94a3db64
WORKDIR /app
COPY --from=build /src/target/einvoice-sidecar-1.0.0.jar app.jar
EXPOSE 8080
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-Xmx384m", "-jar", "/app/app.jar"]
