import sqlite3
import json
import os
import time

DB_PATH = "/app/backend/data/webui.db"
MCP_SERVERS = [
    {"id": "kubernetes", "name": "Kubernetes", "url": "http://openclaw-mcp-core:8080/mcp", "type": "http"},
    {"id": "postgres", "name": "Postgres", "url": "http://openclaw-mcp-core:3001/mcp", "type": "http"},
    {"id": "mattermost", "name": "Mattermost", "url": "http://openclaw-mcp-core:8000/mcp", "type": "http"},
    {"id": "nextcloud", "name": "Nextcloud", "url": "http://openclaw-mcp-apps:8000/mcp", "type": "http"},
    {"id": "invoiceninja", "name": "InvoiceNinja", "url": "http://openclaw-mcp-apps:8080/mcp", "type": "http"},
    {"id": "keycloak", "name": "Keycloak", "url": "http://openclaw-mcp-auth:8080/mcp/sse", "type": "sse"},
    {"id": "wordpress", "name": "WordPress", "url": "http://wordpress.wordpress.svc.cluster.local/wp-json/mcp/mcp-adapter-default-server", "type": "http"},
]

def setup_mcp():
    try:
        if not os.path.exists(DB_PATH):
            print(f"Error: Database not found at {DB_PATH}")
            return

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if config table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='config'")
        has_config_table = cursor.fetchone() is not None

        if has_config_table:
            print("Checking config table schema...")
            cursor.execute("PRAGMA table_info(config)")
            columns = [c[1] for c in cursor.fetchall()]
            
            if "key" in columns and "value" in columns:
                print("Updating config table (old schema)...")
                cursor.execute("SELECT value FROM config WHERE key='mcp_servers'")
                row = cursor.fetchone()
                
                mcp_config = {"servers": {}}
                if row:
                    try:
                        mcp_config = json.loads(row[0])
                    except:
                        pass
                
                for s in MCP_SERVERS:
                    mcp_config["servers"][s["id"]] = {
                        "name": s["name"],
                        "url": s["url"],
                        "type": s["type"],
                        "enabled": True
                    }
                
                mcp_json = json.dumps(mcp_config)
                cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('mcp_servers', ?)", (mcp_json,))
                print(f"Updated config table.")
            else:
                print("Skipping config table update (unknown schema).")

        # Check if mcp_server table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_server'")
        has_mcp_table = cursor.fetchone() is not None

        if has_mcp_table:
            print("Updating mcp_server table...")
            now = int(time.time())
            for s in MCP_SERVERS:
                cursor.execute("""
                    INSERT OR REPLACE INTO mcp_server (id, name, url, type, config, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (s["id"], s["name"], s["url"], s["type"], "{}", now, now))
            print(f"Updated mcp_server table.")

        conn.commit()
        conn.close()
        print("MCP registration attempt complete.")
    except Exception as e:
        print(f"MCP registration failed (continuing anyway): {e}")

if __name__ == "__main__":
    setup_mcp()
