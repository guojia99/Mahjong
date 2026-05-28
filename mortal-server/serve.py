import prelude

import os
import sys
import json
import torch
import logging
import threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from model import Brain, DQN
from engine import MortalEngine
from common import filtered_trimmed_lines
from libriichi.mjai import Bot
from config import config

logger = logging.getLogger(__name__)

USAGE = '''Usage: python serve.py [--host HOST] [--port PORT] [--player-id ID]

OPTIONS:
    --host HOST       Bind address (default: 127.0.0.1)
    --port PORT       Listen port (default: 8080)
    --player-id ID    Player ID, 0-3 (default: 0)'''

def parse_args():
    args = {
        'host': '127.0.0.1',
        'port': 8080,
        'player_id': 0,
    }
    i = 1
    while i < len(sys.argv):
        key = sys.argv[i]
        if key == '--host' and i + 1 < len(sys.argv):
            args['host'] = sys.argv[i + 1]
            i += 2
        elif key == '--port' and i + 1 < len(sys.argv):
            args['port'] = int(sys.argv[i + 1])
            i += 2
        elif key == '--player-id' and i + 1 < len(sys.argv):
            args['player_id'] = int(sys.argv[i + 1])
            i += 2
        else:
            print(USAGE, file=sys.stderr)
            sys.exit(1)
    assert 0 <= args['player_id'] <= 3, 'player_id must be 0-3'
    return args


class GameState:
    def __init__(self, engine, player_id):
        self.engine = engine
        self.player_id = player_id
        self.lock = threading.Lock()
        self._bots = {}

    def get_bot(self, game_id):
        with self.lock:
            if game_id not in self._bots:
                self._bots[game_id] = Bot(self.engine, self.player_id)
            return self._bots[game_id]

    def remove_bot(self, game_id):
        with self.lock:
            self._bots.pop(game_id, None)

    def react(self, game_id, event_str):
        bot = self.get_bot(game_id)
        reaction = bot.react(event_str)
        return reaction


class RequestHandler(BaseHTTPRequestHandler):
    game_state: 'GameState'

    def log_message(self, format, *args):
        logger.info(format, *args)

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(length).decode('utf-8') if length > 0 else ''

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/health':
            self._json_response({'status': 'ok'})
            return

        if path == '/info':
            self._json_response({
                'player_id': self.game_state.player_id,
                'model_tag': self.server.model_tag,
            })
            return

        self._json_response({'error': 'not found'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/react':
            self._handle_react()
        elif path == '/game':
            self._handle_game()
        else:
            self._json_response({'error': 'not found'}, status=404)

    def _handle_react(self):
        try:
            body = self._read_body()
            data = json.loads(body)

            game_id = data.get('game_id', 'default')
            events = data.get('events')

            if events is None:
                self._json_response({'error': 'missing "events" field'}, status=400)
                return

            if isinstance(events, str):
                events = [events]
            elif not isinstance(events, list):
                self._json_response({'error': '"events" must be a string or list of strings'}, status=400)
                return

            responses = []
            for event_str in events:
                event_str = event_str.strip()
                if not event_str:
                    continue
                reaction = self.game_state.react(game_id, event_str)
                if reaction:
                    responses.append(json.loads(reaction))

            self._json_response({'reactions': responses})
        except json.JSONDecodeError:
            self._json_response({'error': 'invalid JSON'}, status=400)
        except Exception as e:
            logger.exception('error in /react')
            self._json_response({'error': str(e)}, status=500)

    def _handle_game(self):
        try:
            body = self._read_body()
            data = json.loads(body)

            game_id = data.get('game_id', 'default')
            action = data.get('action')

            if action == 'reset':
                self.game_state.remove_bot(game_id)
                self._json_response({'status': 'reset'})
                return

            self._json_response({'error': 'unknown action, use "reset"'}, status=400)
        except json.JSONDecodeError:
            self._json_response({'error': 'invalid JSON'}, status=400)


class ThreadedHTTPServer(HTTPServer):
    allow_reuse_address = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.daemon_threads = True


def load_model():
    state_file = config['control']['state_file']
    device = torch.device('cpu')
    state = torch.load(state_file, weights_only=True, map_location=device)
    cfg = state['config']
    version = cfg['control'].get('version', 1)
    num_blocks = cfg['resnet']['num_blocks']
    conv_channels = cfg['resnet']['conv_channels']

    if 'tag' in state:
        tag = state['tag']
    else:
        time = datetime.fromtimestamp(state['timestamp'], tz=timezone.utc).strftime('%y%m%d%H')
        tag = f'mortal{version}-b{num_blocks}c{conv_channels}-t{time}'

    logging.info(f'loading model: {tag}')
    logging.info(f'  version={version}, blocks={num_blocks}, channels={conv_channels}')

    mortal = Brain(version=version, num_blocks=num_blocks, conv_channels=conv_channels).eval()
    dqn = DQN(version=version).eval()
    mortal.load_state_dict(state['mortal'])
    dqn.load_state_dict(state['current_dqn'])

    engine = MortalEngine(
        mortal,
        dqn,
        version=version,
        is_oracle=False,
        device=device,
        enable_amp=False,
        enable_quick_eval=True,
        enable_rule_based_agari_guard=True,
        name='mortal',
    )
    logging.info('model loaded')
    return engine, tag


def main():
    args = parse_args()
    engine, tag = load_model()
    game_state = GameState(engine, args['player_id'])

    RequestHandler.game_state = game_state

    server = ThreadedHTTPServer((args['host'], args['port']), RequestHandler)
    server.model_tag = tag

    logging.info(f'Mortal inference server started')
    logging.info(f'  host: {args["host"]}:{args["port"]}')
    logging.info(f'  player_id: {args["player_id"]}')
    logging.info(f'  model: {tag}')
    logging.info('')
    logging.info(f'  POST /react   - send mjai events, get reactions')
    logging.info(f'  POST /game     - game session management (action=reset)')
    logging.info(f'  GET  /health   - health check')
    logging.info(f'  GET  /info     - model info')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logging.info('shutting down')
        server.shutdown()


if __name__ == '__main__':
    main()
