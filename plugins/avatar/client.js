const ConvexGeometry = require('./lib/three-extra/ConvexGeometry');

class Avatar {
  mount() {
    const {three: {THREE}, elements} = zeo;

    const THREEConvexGeometry = ConvexGeometry(THREE);

    const sqrt2 = Math.sqrt(2);
    const tetrahedronGeometry = (() => {
      const points = [
        new THREE.Vector3(0, 0.1, 0),
        new THREE.Vector3(-0.1, 0, -0.1),
        new THREE.Vector3(0.1, 0, -0.1),
        new THREE.Vector3(0, 0, 0.1 / sqrt2),
        new THREE.Vector3(0, -0.1, 0),
      ];
      return new THREEConvexGeometry(points);
    })();
    const triangleGeometry = (() => {
      const points = [
        new THREE.Vector3(-0.1, 0, -0.1),
        new THREE.Vector3(0.1, 0, -0.1),
        new THREE.Vector3(0, 0, 0.1 / sqrt2),
        new THREE.Vector3(0, -0.1, 0),
      ];
      return new THREEConvexGeometry(points);
    })();

    const avatarEntity = {
      attributes: {
        position: {
          type: 'matrix',
          value: [
            0, 0, 0,
            0, 0, 0, 1,
            1, 1, 1,
          ],
        },
      },
      entityAddedCallback(entityElement) {
        const entityApi = entityElement.getEntityApi();
        const entityObject = entityElement.getObject();

        const mesh = (() => {
          const result = new THREE.Object3D();

          const solidMaterial = new THREE.MeshPhongMaterial({
            color: 0xE91E63,
            shininess: 10,
            shading: THREE.FlatShading,
          });

          const head = (() => {
            const geometry = tetrahedronGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 1.1;
            mesh.scale.y = 1.25;
            return mesh;
          })();
          result.add(head);
          result.head = head;

          const body = (() => {
            const geometry = triangleGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.9;
            mesh.scale.set(2, 3, 1);
            return mesh;
          })();
          result.add(body);
          result.body = body;

          const leftArm = (() => {
            const geometry = tetrahedronGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.65;
            mesh.position.x = -0.2;
            mesh.scale.set(0.5, 2.25, 0.5);
            return mesh;
          })();
          result.add(leftArm);
          result.leftArm = leftArm;

          const rightArm = (() => {
            const geometry = tetrahedronGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.65;
            mesh.position.x = 0.2;
            mesh.scale.set(0.5, 2.25, 0.5);
            return mesh;
          })();
          result.add(rightArm);
          result.rightArm = rightArm;

          const leftLeg = (() => {
            const geometry = tetrahedronGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.3;
            mesh.position.x = -0.1;
            mesh.scale.set(0.75, 3, 0.75);
            return mesh;
          })();
          result.add(leftLeg);
          result.leftLeg = leftLeg;

          const rightLeg = (() => {
            const geometry = tetrahedronGeometry.clone();
            const material = solidMaterial;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.3;
            mesh.position.x = 0.1;
            mesh.scale.set(0.75, 3, 0.75);
            return mesh;
          })();
          result.add(rightLeg);
          result.rightLeg = rightLeg;

          return result;
        })();
        entityObject.add(mesh);
        entityApi.mesh = mesh;

        entityApi._cleanup = () => {
          entityObject.remove(mesh);
        };
      },
      entityAttributeValueChangedCallback(entityElement, name, oldValue, newValue) {
        const entityApi = entityElement.getEntityApi();

        switch (name) {
          case 'position': {
            const position = newValue;

            if (position) {
              const {mesh} = entityApi;

              mesh.position.set(position[0], position[1], position[2]);
              mesh.quaternion.set(position[3], position[4], position[5], position[6]);
              mesh.scale.set(position[7], position[8], position[9]);
            }

            break;
          }
        }
      },
      entityRemovedCallback(entityElement) {
        const entityApi = entityElement.getEntityApi();

        entityApi._cleanup();
      },
    };
    elements.registerEntity(this, avatarEntity);

    this._cleanup = () => {
      elements.unregisterEntity(this, avatarEntity);
    };
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Avatar;
