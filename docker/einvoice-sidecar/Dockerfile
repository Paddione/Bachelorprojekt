# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/einvoice-sidecar-1.0.0.jar app.jar
EXPOSE 8080
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-Xmx384m", "-jar", "/app/app.jar"]
