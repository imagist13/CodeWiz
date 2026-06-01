from __future__ import annotations

"""Cron scheduler for periodic tasks."""
import asyncio
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Optional
from croniter import croniter

from paths import get_data_dir
from runcore.context import set_user_context
from core.config import load_user_config

log = logging.getLogger(__name__)

_scheduler_instance: Optional['_CronScheduler'] = None


class _CronScheduler:
    """Background cron scheduler."""

    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._tick_interval = 5  # seconds

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        if self._running:
            return
        self._running = True
        self._loop = loop or asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True, name='cron-scheduler')
        self._thread.start()
        log.info('Cron scheduler started')

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)
        log.info('Cron scheduler stopped')

    def _run(self) -> None:
        while self._running:
            try:
                self._tick()
            except Exception as e:
                log.exception('Cron tick error')
            time.sleep(self._tick_interval)

    def _tick(self) -> None:
        """Check and run due tasks."""
        data_dir = get_data_dir()
        users_dir = os.path.join(data_dir, 'users')

        if not os.path.isdir(users_dir):
            return

        now = datetime.utcnow()

        for username in os.listdir(users_dir):
            user_tasks_dir = os.path.join(users_dir, username, 'tasks')
            if not os.path.isdir(user_tasks_dir):
                continue

            for task_file in Path(user_tasks_dir).glob('*.json'):
                try:
                    task = json.loads(task_file.read_text(encoding='utf-8'))
                    if not task.get('enabled', True):
                        continue

                    next_run = self._get_next_run(task, now)
                    if next_run and now >= next_run - timedelta(seconds=30):
                        self._execute_task(username, task)
                        # Update last_run
                        task['last_run'] = now.isoformat()
                        task['next_run'] = next_run.isoformat()
                        task_file.write_text(json.dumps(task, indent=2, ensure_ascii=False), encoding='utf-8')

                except Exception as e:
                    log.warning(f'Task {task_file} error: {e}')

    def _get_next_run(self, task: dict, now: datetime) -> Optional[datetime]:
        time_expr = task.get('time_expr', '')
        task_type = task.get('type', 'once')
        last_run = task.get('last_run')

        try:
            if task_type == 'once':
                # time_expr is ISO datetime
                return datetime.fromisoformat(time_expr)
            elif task_type == 'daily':
                # time_expr is HH:MM
                today_target = datetime.strptime(time_expr, '%H:%M').replace(year=now.year, month=now.month, day=now.day)
                if today_target <= now:
                    today_target += timedelta(days=1)
                return today_target
            elif task_type == 'recurring':
                # Cron expression
                base = datetime.fromisoformat(last_run) if last_run else now
                cron = croniter(time_expr, base)
                return cron.get_next(datetime)
        except Exception:
            pass
        return None

    def _execute_task(self, username: str, task: dict) -> None:
        """Execute a due task."""
        log.info(f'Executing task for {username}: {task.get("name")}')
        command = task.get('command', '')
        if not command:
            return

        # Run in thread pool
        if self._loop:
            asyncio.run_coroutine_threadsafe(
                self._run_command(username, command),
                self._loop
            )

    async def _run_command(self, username: str, command: str) -> None:
        """Run a task command."""
        try:
            set_user_context(username, load_user_config(username))
            # This would call the agent to process the command
            # For now, just log it
            log.info(f'Task command for {username}: {command[:100]}')
        except Exception as e:
            log.error(f'Task execution error: {e}')
        finally:
            from runcore.context import clear_context
            clear_context()


def get_scheduler() -> _CronScheduler:
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = _CronScheduler()
    return _scheduler_instance


def start_cron() -> None:
    get_scheduler().start()


def stop_cron() -> None:
    global _scheduler_instance
    if _scheduler_instance:
        _scheduler_instance.stop()
        _scheduler_instance = None
