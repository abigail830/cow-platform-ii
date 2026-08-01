# OKF Content Studio sandbox — reference Dockerfile for E2B Template SDK / manual review.
# Build via: npm run e2b:build-content-studio-template (uses template.ts, not this file directly).

FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    poppler-utils \
    pandoc \
    python3-pip \
    python3-dev \
    python3-venv \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    libjpeg-dev \
    gcc \
    build-essential \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages \
    'markitdown[pptx]' \
    Pillow \
    defusedxml \
    lxml

RUN npm install -g \
    pptxgenjs \
    docx \
    react \
    react-dom \
    react-icons \
    sharp

RUN mkdir -p /home/user/content-studio/skills/docx /home/user/content-studio/skills/pptx

WORKDIR /home/user/content-studio
RUN npm init -y && npm install docx pptxgenjs react react-dom react-icons sharp

# Skill helper scripts (also copied via template.ts during E2B build)
COPY agent-catalog/content-studio/skills/docx/scripts /home/user/content-studio/skills/docx/scripts
COPY agent-catalog/content-studio/skills/pptx/scripts /home/user/content-studio/skills/pptx/scripts

WORKDIR /home/user

USER user
