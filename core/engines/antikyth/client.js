const idUtils = require('./lib/idUtils');

const FRAME_RATE = 60;
const TICK_TIME = 1000 / FRAME_RATE;

class AnyikythClient {
  mount() {
    return new Promise((accept, reject) => {
      const connection = new WebSocket('ws://' + location.host + '/archae/antikythWs');
      connection.onopen = () => {
        accept(api);
      };
      connection.onerror = err => {
        reject(err);
      };
      connection.onmessage = msg => {
        const m = JSON.parse(msg.data);
        const {id} = m;

        const requestHandler = requestHandlers.get(id);
        if (requestHandler) {
          const {error, result} = m;
          requestHandler(error, result);
        } else {
          console.warn('unregistered handler:', JSON.stringify(id));
        }
      };

      const requestHandlers = new Map();
      const _request = (method, args, cb) => {
        const id = idUitls.makeId();

        const e = {
          method,
          id,
          args,
        };
        const es = JSON.stringify(e);
        connection.send(es);

        const requestHandler = (err, result) => {
          if (!err) {
            cb(null, result);
          } else {
            cb(err);
          }

          requestHandlers.delete(id);
        };
        requestHandlers.set(id, requestHandler);
      };

      let lastUpdateTime = null;
      let timeout = null;
      const _recurse = () => {
        const timeUntilNextUpdate = (() => {
          if (lastUpdateTime === null) {
            return 0;
          } else {
            const now = Date.now();
            const timeSinceLastUpdate = now - lastUpdateTime;
            return Math.max(TICK_TIME - timeSinceLastUpdate, 0);
          }
        })();

        const _requestUpdate = () => {
          _request('requestUpdate', [], (err, updates) => {
            for (let i = 0; i < updates.length; i++) {
              const update = updates[i];
              const {id} = update;

              const object = objects.get(id);
              if (object) {
                const {position, rotation, linearVelocity, angularVelocity} = update;
                object.update({position, rotation, linearVelocity, angularVelocity});
              } else {
                console.warn('invalid object update:', JSON.stringify(id));
              }
            }

            lastUpdateTime = Date.now();

            _recurse();
          });
        };

        if (timeUntilNextUpdate === 0) {
          _requestUpdate();
        } else {
          timeout = setTimeout(() => {
            _requestUpdate();

            timeout = null;
          }, FRAME_RATE);
        }
      };
      _recurse();

      this._cleanup = () => {
        connection.close();

        if (timeout) {
          clearTimeout(timeout);
        }
      };

      class Entity {
        constructor(id = idUtils.makeId()) {
          this.id = id;
        }

        add(child) {
          const {id: parentId} = this;
          const {id: childId} = child;

          _request('add', [parentId, childId], _warnError);
        }

        remove(child) {
          const {id: parentId} = this;
          const {id: childId} = child;

          _request('remove', [parentId, childId], _warnError);
        }
      }

      class Engine extends Entity {
        constructor() {
          super(null);
        }
      }

      const engine = new Engine();

      class World extends Entity {
        constructor() {
          super();

          const {id} = this;

          _request('create', ['world', id, {}], _warnError);
        }
      }
      Engine.World = World;

      class Body extends Entity {
        constructor(type, opts) {
          super();

          const {id} = this;

          _request('create', [type, id, opts], _warnError);
        }

        update({position, rotation, linearVelocity, angularVelocity}) {
          this.position = position;
          this.rotation = rotation;
          this.linearVelocity = linearVelocity;
          this.angularVelocity = angularVelocity;
        }

        setPosition(position) {
          const {id} = this;

          _request('setPosition', [id, position], _warnError);
        }

        setRotation(rotation) {
          const {id} = this;

          _request('setRotation', [id, rotation], _warnError);
        }

        setLinearVelocity(linearVelocity) {
          const {id} = this;

          _request('setLinearVelocity', [id, linearVelocity], _warnError);
        }

        setAngularVelocity(angularVelocity) {
          const {id} = this;

          _request('setAngularVelocity', [id, angularVelocity], _warnError);
        }
      }

      class Plane extends Body {
        constructor(opts) {
          super('plane', opts);
        }
      }

      class Sphere extends Body {
        constructor(opts) {
          super('sphere', opts);
        }
      }

      class Box extends Body {
        constructor(opts) {
          super('box', opts);
        }
      }

      class ConvexHull extends Body {
        constructor(opts) {
          super('convexHull', opts);
        }
      }

      class TriangleMesh extends Body {
        constructor(opts) {
          super('triangleMesh', opts);
        }
      }

      const api = {
        engine,
        Plane,
        Sphere,
        Box,
        ConvexHull,
        TriangleMesh,
      };
    });
  },
  unmount() {
    this._cleanup();
  },
});

const _warnError = err => {
  if (err) {
    console.warn(err);
  }
};

module.exports = AnyikythClient;
