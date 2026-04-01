FROM nginx:1.27-alpine

# Copy the docsify index.html (client-side renderer)
# Build context is repo root: docker build -f Bachelorprojekt/docs-site/Dockerfile .
COPY Bachelorprojekt/docs-site/index.html /usr/share/nginx/html/index.html

# Copy all GitBook markdown docs into the web root
COPY docs/ /usr/share/nginx/html/

EXPOSE 80
