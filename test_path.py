import sys
sys.path.insert(0, r'd:\桌面\cdfg\hermes\backend')
from runcore.security import safe_path
from runcore.context import set_user_context
from core.config import load_user_config

config = load_user_config('赵雷')
set_user_context('赵雷', config)

# Test cases
tests = [
    r'D:\桌面\cdfg\hermes\data\users\赵雷\repos\conduit-realworld-example-app\backend\models\Article.js',
    'D:/桌面/cdfg/hermes/data/users/赵雷/repos/conduit-realworld-example-app/backend/models/Article.js',
    'backend/models/Article.js',
    'conduit-realworld-example-app/backend/models/Article.js',
    'Article.js',
]

for t in tests:
    try:
        r = safe_path('赵雷', t)
        exists = 'OK' if __import__('os').path.exists(r) else 'MISSING'
        print(exists + ' | ' + r)
    except Exception as e:
        print('ERROR | ' + t + ' | ' + str(e))
