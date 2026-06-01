"""FastAPI 入口"""

import uvicorn
from config import get_app_config
from app import create_app


def main():
    cfg = get_app_config()
    app = create_app()
    uvicorn.run(
        app,
        host=cfg["host"],
        port=cfg["port"],
        reload=cfg["debug"],
        log_level="info",
    )


if __name__ == "__main__":
    main()
