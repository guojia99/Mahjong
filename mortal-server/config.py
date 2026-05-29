import os
import toml

_config = None


def config_path() -> str:
    return os.environ.get('MORTAL_CFG', 'config.toml')


def load_config(path: str | None = None) -> dict:
    global _config
    p = path or config_path()
    with open(p, encoding='utf-8') as f:
        _config = toml.load(f)
    return _config


def get_config() -> dict:
    global _config
    if _config is None:
        load_config()
    return _config


class _ConfigProxy:
    def __getitem__(self, key):
        return get_config()[key]

    def get(self, key, default=None):
        return get_config().get(key, default)


config = _ConfigProxy()
