const WIDTH = 1024;
const HEIGHT = Math.round(WIDTH / 1.5);
const ASPECT_RATIO = WIDTH / HEIGHT;
const WORLD_WIDTH = 2;
const WORLD_HEIGHT = WORLD_WIDTH / ASPECT_RATIO;
const WORLD_DEPTH = WORLD_WIDTH / 50;

const NAVBAR_WIDTH = WIDTH;
const NAVBAR_HEIGHT = 50;
const NAVBAR_ASPECT_RATIO = NAVBAR_WIDTH / NAVBAR_HEIGHT;
const NAVBAR_WORLD_WIDTH = WORLD_WIDTH;
const NAVBAR_WORLD_HEIGHT = NAVBAR_WORLD_WIDTH / NAVBAR_ASPECT_RATIO;
const NAVBAR_WORLD_DEPTH = 0.01;

const DEFAULT_USER_HEIGHT = 1.6;

const TRANSITION_TIME = 1000;

module.exports = {
  WIDTH,
  HEIGHT,
  ASPECT_RATIO,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_DEPTH,

  NAVBAR_WIDTH,
  NAVBAR_HEIGHT,
  NAVBAR_ASPECT_RATIO,
  NAVBAR_WORLD_WIDTH,
  NAVBAR_WORLD_HEIGHT,
  NAVBAR_WORLD_DEPTH,

  DEFAULT_USER_HEIGHT,

  TRANSITION_TIME,
};
