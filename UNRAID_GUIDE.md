# Unraid Deployment & Update Guide

This guide details how to build, deploy, and update the Discord LLM Bot on Unraid.

## Prerequisites

- **Unraid Server** with Docker enabled.
- **Terminal Access** (SSH) to your Unraid server.
- **Local Development Machine** (optional, if building locally).

## Configuration Check

Before updating, ensure your `docker-compose.unraid.yml` on the server points to the correct paths.
Current configured paths (verify these match your Unraid setup):
- Config Path: `/mnt/cache-pcie/docker-share/appdata/discord-llm-bot`
- Volumes:
  - `./data` -> `/mnt/cache-pcie/docker-share/appdata/discord-llm-bot/data`
  - `./logs` -> `/mnt/cache-pcie/docker-share/appdata/discord-llm-bot/logs`

## Workflow A: Build on Unraid (Recommended)

This method is easiest if you have the source code on your Unraid server (e.g., via git).

1.  **SSH into Unraid:**
    ```bash
    ssh root@<your-unraid-ip>
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd /mnt/cache-pcie/docker-share/appdata/discord-llm-bot
    ```

3.  **Update Source Code:**
    ```bash
    git pull
    ```

4.  **Build the Docker Image:**
    ```bash
    docker build -f Dockerfile.unraid -t discord-llm-bot:latest .
    ```

5.  **Restart the Container:**
    ```bash
    docker-compose -f docker-compose.unraid.yml up -d
    ```

---

## Workflow B: Build Locally & Import (Offline/Remote Build)

Use this method if you develop on a separate machine and want to "push" the update to Unraid without installing git/tools on Unraid.

### 1. On Your Local Machine

1.  **Build the Image:**
    Make sure you are in the project root.
    ```bash
    docker build -f Dockerfile.unraid -t discord-llm-bot:latest .
    ```

2.  **Export the Image to a File:**
    ```bash
    docker save -o discord-bot.tar discord-llm-bot:latest
    ```
    *(This creates a large .tar file of the image)*

3.  **Transfer File to Unraid:**
    Replace `<unraid-ip>` with your server's IP.
    ```bash
    scp discord-bot.tar root@<unraid-ip>:/mnt/cache-pcie/docker-share/appdata/discord-llm-bot/
    ```

### 2. On Unraid Server

1.  **SSH into Unraid:**
    ```bash
    ssh root@<your-unraid-ip>
    ```

2.  **Navigate to Directory:**
    ```bash
    cd /mnt/cache-pcie/docker-share/appdata/discord-llm-bot
    ```

3.  **Load the Image:**
    ```bash
    docker load -i discord-bot.tar
    ```

4.  **Restart the Container:**
    ```bash
    docker-compose -f docker-compose.unraid.yml up -d
    ```

5.  **Cleanup:**
    ```bash
    rm discord-bot.tar
    ```

## Troubleshooting

-   **Check Logs:**
    ```bash
    docker logs -f discord-llm-bot
    ```
-   **Force Recreate:**
    If the container doesn't seem to update:
    ```bash
    docker-compose -f docker-compose.unraid.yml down
    docker-compose -f docker-compose.unraid.yml up -d --force-recreate
    ```
