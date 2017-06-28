const Ammo = require('bllt');

const ACTIVE_TAG = 1;
const ISLAND_SLEEPING = 2;
const WANTS_DEACTIVATION = 3;
const DISABLE_DEACTIVATION = 4;
const DISABLE_SIMULATION = 5;

const FPS = 1000 / 90;
const FIXED_TIME_STEP = 1 / 200;
const BT_VECTOR3 = new Ammo.btVector3();
const BT_TRANSFORM = new Ammo.btTransform();
const BT_QUATERNION = new Ammo.btQuaternion();

const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
const broadphase = new Ammo.btDbvtBroadphase();
const solver = new Ammo.btSequentialImpulseConstraintSolver();
const physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));

const bodies = [];

class Body {
  constructor(id, rigidBody, owner, destroy) {
    this.id = id;
    this.rigidBody = rigidBody;
    this.owner = owner;
    this.destroy = destroy;

    this._lastUpdate = null;
  }

  getUpdate() {
    const {id, rigidBody, _lastUpdate: lastUpdate} = this;

    rigidBody.getMotionState().getWorldTransform(BT_TRANSFORM);
    const pv = BT_TRANSFORM.getOrigin();
    const p = [pv.x(), pv.y(), pv.z()];
    const qv = BT_TRANSFORM.getRotation();
    const q = [qv.x(), qv.y(), qv.z(), qv.w()];

    if (lastUpdate === null || !_arrayEquals(lastUpdate.position, p) || !_arrayEquals(lastUpdate.rotation, q)) {
      const newUpdate = {
        id: id,
        position: p,
        rotation: q,
      };
      this._lastUpdate = newUpdate;

      return newUpdate;
    } else {
      return null;
    }
  }

  setState(position, rotation, linearVelocity, angularVelocity, activate) {
    const {rigidBody} = this;

    BT_TRANSFORM.setIdentity();

    BT_VECTOR3.setX(position[0]);
    BT_VECTOR3.setY(position[1]);
    BT_VECTOR3.setZ(position[2]);
    BT_TRANSFORM.setOrigin(BT_VECTOR3);

    BT_QUATERNION.setX(rotation[0]);
    BT_QUATERNION.setY(rotation[1]);
    BT_QUATERNION.setZ(rotation[2]);
    BT_QUATERNION.setW(rotation[3]);
    BT_TRANSFORM.setRotation(BT_QUATERNION);

    rigidBody.setCenterOfMassTransform(BT_TRANSFORM);

    BT_VECTOR3.setX(linearVelocity[0]);
    BT_VECTOR3.setY(linearVelocity[1]);
    BT_VECTOR3.setZ(linearVelocity[2]);
    rigidBody.setLinearVelocity(BT_VECTOR3);

    BT_VECTOR3.setX(angularVelocity[0]);
    BT_VECTOR3.setY(angularVelocity[1]);
    BT_VECTOR3.setZ(angularVelocity[2]);
    rigidBody.setAngularVelocity(BT_VECTOR3);

    if (activate) {
      rigidBody.activate();
    }
  }

  clearCache() {
    this._lastUpdate = null;
  }
}

const _addBody = body => {
  const {rigidBody} = body;
  physicsWorld.addRigidBody(rigidBody);

  bodies.push(body);

  if (bodies.length === 1) {
    _start();
  }
};

const _removeBody = (body, bodyIndex) => {
  const {rigidBody} = body;
  physicsWorld.removeRigidBody(rigidBody);
  body.destroy();

  bodies.splice(bodyIndex, 1);

  if (bodies.length === 0) {
    _stop();
  }
};

process.on('message', m => {
  const {method, args} = m;

  switch (method) {
    case 'add': {
      const [id, type, spec, position, rotation, mass, linearFactor, angularFactor, disableDeactivation, owner] = args;

      const body = bodies.find(body => body.id === id);
      if (!body) {
        switch (type) {
          case 'box': {
            const boxShape = new Ammo.btBoxShape(new Ammo.btVector3(spec[0] / 2, spec[1] / 2, spec[2] / 2));

            const boxTransform = BT_TRANSFORM;
            boxTransform.setIdentity();

            BT_VECTOR3.setX(position[0]);
            BT_VECTOR3.setY(position[1]);
            BT_VECTOR3.setZ(position[2]);
            boxTransform.setOrigin(BT_VECTOR3);

            BT_QUATERNION.setX(rotation[0]);
            BT_QUATERNION.setY(rotation[1]);
            BT_QUATERNION.setZ(rotation[2]);
            BT_QUATERNION.setW(rotation[3]);
            boxTransform.setRotation(BT_QUATERNION);

            const boxMass = mass;
            const boxLocalInertia = BT_VECTOR3;
            boxLocalInertia.setX(0);
            boxLocalInertia.setY(0);
            boxLocalInertia.setZ(0);
            boxShape.calculateLocalInertia(boxMass, boxLocalInertia);

            const boxMotionState = new Ammo.btDefaultMotionState(boxTransform);
            const boxConstructionInfo = new Ammo.btRigidBodyConstructionInfo(boxMass, boxMotionState, boxShape, boxLocalInertia);

            const boxBody = new Ammo.btRigidBody(boxConstructionInfo);

            BT_VECTOR3.setX(linearFactor[0]);
            BT_VECTOR3.setY(linearFactor[1]);
            BT_VECTOR3.setZ(linearFactor[2]);
            boxBody.setLinearFactor(BT_VECTOR3);

            BT_VECTOR3.setX(angularFactor[0]);
            BT_VECTOR3.setY(angularFactor[1]);
            BT_VECTOR3.setZ(angularFactor[2]);
            boxBody.setAngularFactor(BT_VECTOR3);

            if (disableDeactivation) {
              boxBody.setActivationState(DISABLE_DEACTIVATION);
            }
            
            const body = new Body(id, boxBody, owner, () => {
              Ammo.destroy(boxBody);
              Ammo.destroy(boxConstructionInfo);
              Ammo.destroy(boxMotionState);
              Ammo.destroy(boxShape);
            });
            _addBody(body);

            break;
          }
          case 'plane': {
            const planeShape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(spec[0], spec[1], spec[2]), spec[3]);

            const planeTransform = BT_TRANSFORM;
            planeTransform.setIdentity();

            BT_VECTOR3.setX(position[0]);
            BT_VECTOR3.setY(position[1]);
            BT_VECTOR3.setZ(position[2]);
            planeTransform.setOrigin(BT_VECTOR3);

            BT_QUATERNION.setX(rotation[0]);
            BT_QUATERNION.setY(rotation[1]);
            BT_QUATERNION.setZ(rotation[2]);
            BT_QUATERNION.setW(rotation[3]);
            planeTransform.setRotation(BT_QUATERNION);

            const planeMass = mass;
            const planeLocalInertia = BT_VECTOR3;
            planeLocalInertia.setX(0);
            planeLocalInertia.setY(0);
            planeLocalInertia.setZ(0);
            planeShape.calculateLocalInertia(planeMass, planeLocalInertia);

            const planeMotionState = new Ammo.btDefaultMotionState(planeTransform);
            const planeBody = new Ammo.btRigidBody(new Ammo.btRigidBodyConstructionInfo(planeMass, planeMotionState, planeShape, planeLocalInertia));

            BT_VECTOR3.setX(linearFactor[0]);
            BT_VECTOR3.setY(linearFactor[1]);
            BT_VECTOR3.setZ(linearFactor[2]);
            planeBody.setLinearFactor(BT_VECTOR3);

            BT_VECTOR3.setX(angularFactor[0]);
            BT_VECTOR3.setY(angularFactor[1]);
            BT_VECTOR3.setZ(angularFactor[2]);
            planeBody.setAngularFactor(BT_VECTOR3);

            if (disableDeactivation) {
              planeBody.setActivationState(DISABLE_DEACTIVATION);
            }

            const body = new Body(id, planeBody, owner, () => {
              Ammo.destroy(planeBody);
              Ammo.destroy(planeConstructionInfo);
              Ammo.destroy(planeMotionState);
              Ammo.destroy(planeShape);
            });
            _addBody(body);

            break;
          }
          case 'compound': {
            const compoundShape = new Ammo.btCompoundShape();

            const childSpecs = spec;
            const childDestroys = [];
            for (let i = 0; i < childSpecs.length; i++) {
              const childSpec = childSpecs[i];
              const [type, spec, position, rotation, mass] = childSpec;

              switch (type) {
                case 'box': {
                  const boxShape = new Ammo.btBoxShape(new Ammo.btVector3(spec[0] / 2, spec[1] / 2, spec[2] / 2));

                  const boxTransform = BT_TRANSFORM;
                  boxTransform.setIdentity();

                  BT_VECTOR3.setX(position[0]);
                  BT_VECTOR3.setY(position[1]);
                  BT_VECTOR3.setZ(position[2]);
                  boxTransform.setOrigin(BT_VECTOR3);

                  BT_QUATERNION.setX(rotation[0]);
                  BT_QUATERNION.setY(rotation[1]);
                  BT_QUATERNION.setZ(rotation[2]);
                  BT_QUATERNION.setW(rotation[3]);
                  boxTransform.setRotation(BT_QUATERNION);

                  compoundShape.addChildShape(boxTransform, boxShape);

                  childDestroys.push(() => {
                    Ammo.destroy(boxShape);
                  });

                  break;
                }
                default: {
                  console.warn('invalid child type:', JSON.stringify(type));
                  break;
                }
              }
            }

            const compoundTransform = BT_TRANSFORM;
            compoundTransform.setIdentity();

            BT_VECTOR3.setX(position[0]);
            BT_VECTOR3.setY(position[1]);
            BT_VECTOR3.setZ(position[2]);
            compoundTransform.setOrigin(BT_VECTOR3);

            BT_QUATERNION.setX(rotation[0]);
            BT_QUATERNION.setY(rotation[1]);
            BT_QUATERNION.setZ(rotation[2]);
            BT_QUATERNION.setW(rotation[3]);
            compoundTransform.setRotation(BT_QUATERNION);

            const compoundMass = mass;
            const compoundLocalInertia = BT_VECTOR3;
            compoundLocalInertia.setX(0);
            compoundLocalInertia.setY(0);
            compoundLocalInertia.setZ(0);
            compoundShape.calculateLocalInertia(compoundMass, compoundLocalInertia);

            const compoundMotionState = new Ammo.btDefaultMotionState(compoundTransform);
            const compoundConstructionInfo = new Ammo.btRigidBodyConstructionInfo(compoundMass, compoundMotionState, compoundShape, compoundLocalInertia);
            const compoundBody = new Ammo.btRigidBody(compoundConstructionInfo);

            BT_VECTOR3.setX(linearFactor[0]);
            BT_VECTOR3.setY(linearFactor[1]);
            BT_VECTOR3.setZ(linearFactor[2]);
            compoundBody.setLinearFactor(BT_VECTOR3);

            BT_VECTOR3.setX(angularFactor[0]);
            BT_VECTOR3.setY(angularFactor[1]);
            BT_VECTOR3.setZ(angularFactor[2]);
            compoundBody.setAngularFactor(BT_VECTOR3);

            if (disableDeactivation) {
              compoundBody.setActivationState(DISABLE_DEACTIVATION);
            }

            const body = new Body(id, compoundBody, owner, () => {
              Ammo.destroy(compoundBody);
              Ammo.destroy(compoundConstructionInfo);
              Ammo.destroy(compoundMotionState);
              Ammo.destroy(compoundShape);

              for (let i = 0; i < childDestroys; i++) {
                const childDestroy = childDestroys[i];
                childDestroy();
              }
            });
            _addBody(body);

            break;
          }
          default: {
            console.warn('invalid body type:', JSON.stringify(type));
            break;
          }
        }
      } else {
        body.clearCache();
      }
      break;
    }
    case 'remove': {
      const [id] = args;
      const bodyIndex = bodies.findIndex(body => body.id === id);

      if (bodyIndex !== -1) {
        const body = bodies[bodyIndex];

        _removeBody(body, bodyIndex);
      }
      break;
    }
    case 'setState': {
      const [id, position, rotation, linearVelocity, anguilarVelocity, activate] = args;
      const body = bodies.find(body => body.id === id);

      if (body) {
        body.setState(position, rotation, linearVelocity, anguilarVelocity, activate);
      }
      break;
    }
    case 'removeOwner': {
      const [owner] = args;

      const oldBodies = bodies.slice();
      for (let i = 0; i < oldBodies.length; i++) {
        const body = oldBodies[i];

        if (body.owner === owner) {
          _removeBody(body, i);
        }
      }
      break;
    }
    default: {
      console.warn('invalid message type:', JSON.stringify(method));
      break;
    }
  }
});

const _arrayEquals = (a, b) => {
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      const ai = a[i];
      const bi = b[i];

      if (ai !== bi) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
};

let interval = null;
let lastTime = 0;
const _start = () => {
  interval = setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    physicsWorld.stepSimulation(dt, 5, FIXED_TIME_STEP);

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const update = body.getUpdate();

      if (update !== null) {
        process.send(update);
      }
    }

    lastTime = now;
  }, FPS);
  lastTime = Date.now();
};
const _stop = () => {
  clearInterval(interval);
  interval = null;
  lastTime = 0;
};
