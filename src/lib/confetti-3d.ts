import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { randomFrom, rgb, type Rgb } from "./imaging.js";

// Confetti in 3D, thrown towards the camera and landing flat on a card: small
// meshes (paper, foil, stars, curled streamers) under a key and a fill light,
// with their shadows on the card, the nearest out of focus, holographic foil
// glinting, motion trails and out-of-focus lights. The frames are drawn over a
// transparent background, the same for every card in a palette, and a card
// goes under them when posted.

/** The card the confetti fall on. */
export interface ConfettiScene {
  width: number;
  height: number;
  /** Where the confetti are thrown from. */
  launch: { x: number; y: number };
  /** Whether a piece reaching `radius` around (x, y) may land there. */
  clear: (x: number, y: number, radius: number) => boolean;
}

export const CONFETTI_FPS = 30;
/** Seconds the throw lasts: the last piece lands by 2.5 s, then they lie still. */
export const CONFETTI_DURATION = 3;
const FRAMES = CONFETTI_DURATION * CONFETTI_FPS + 1;
const PIECES = 110;
/** The camera looks straight down at the card from this height. */
const CAMERA = 1400;

type V3 = readonly [number, number, number];
type Mat = readonly [V3, V3, V3];
type Face = V3[];
type Point = [number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
const mul = (m: Mat, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const mmul = (a: Mat, b: Mat): Mat => {
  const column = (j: number): V3 => [b[0][j]!, b[1][j]!, b[2][j]!];
  const row = (r: V3): V3 => [
    dot(r, column(0)),
    dot(r, column(1)),
    dot(r, column(2)),
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
};
const rotX = (a: number): Mat => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const rotY = (a: number): Mat => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rotZ = (a: number): Mat => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

/** Key light from the top left, in front of the card; a cool fill from the right. */
const KEY = norm([-0.45, -0.55, 0.7]);
const FILL = norm([0.7, 0.3, 0.6]);

/** Any hue, negative ones included: -90 is 270. */
export function hsl(hue: number, saturation: number, lightness: number): Rgb {
  const k = (n: number) => (((n + hue / 30) % 12) + 12) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const f = (n: number) =>
    Math.round(
      255 * (lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
    );
  return [f(0), f(8), f(4)];
}

// ---------------------------------------------------------------- the models
interface Material {
  shininess: number;
  specular: number;
  /** Tinted highlights, holographic hues. */
  metal: boolean;
}
const PAPER: Material = { shininess: 6, specular: 0.12, metal: false };
const FOIL: Material = { shininess: 48, specular: 1.4, metal: true };
const GOLD: Rgb = [222, 180, 70];
const SILVER: Rgb = [205, 210, 222];

function rectangle(width: number, height: number): Face[] {
  return [
    [
      [-width / 2, -height / 2, 0],
      [width / 2, -height / 2, 0],
      [width / 2, height / 2, 0],
      [-width / 2, height / 2, 0],
    ],
  ];
}

function polygon(count: number, radius: (index: number) => number): Face[] {
  return [
    Array.from({ length: count }, (_, i): V3 => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return [radius(i) * Math.cos(angle), radius(i) * Math.sin(angle), 0];
    }),
  ];
}

/** A curled strip bent along an arc, which lands on its side, arching up. */
function streamer(length: number, width: number, curl: number): Face[] {
  const SEGMENTS = 10;
  const radius = length / curl;
  const point = (i: number, side: number): V3 => {
    const angle = (i / SEGMENTS) * curl - curl / 2;
    return [
      radius * Math.sin(angle),
      side * (width / 2),
      radius * (1 - Math.cos(angle)),
    ];
  };
  return Array.from({ length: SEGMENTS }, (_, i) => [
    point(i, -1),
    point(i + 1, -1),
    point(i + 1, 1),
    point(i, 1),
  ]);
}

// ---------------------------------------------------------------- the pieces
interface Piece {
  faces: Face[];
  material: Material;
  color: Rgb;
  /** Seconds before it is thrown. */
  delay: number;
  /** Seconds going up, then coming down. */
  rise: number;
  fall: number;
  /** Highest point, towards the camera. */
  peak: number;
  launch: V3;
  land: V3;
  yaw: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  phase: number;
  /** Orientation once landed: flat, a streamer on its side. */
  rest: Mat;
}

function pieces(scene: ConfettiScene, colors: readonly Rgb[]): Piece[] {
  // A fixed sequence: the same palette always throws the same confetti.
  const random = randomFrom(42);
  const between = (low: number, high: number) => low + random() * (high - low);
  const paper = () => colors[Math.floor(random() * colors.length)]!;
  const thrown: Piece[] = [];
  for (let i = 0; i < PIECES; i++) {
    const kind = random();
    let faces: Face[];
    let material = PAPER;
    let color: Rgb;
    let radius: number;
    if (kind < 0.42) {
      const [width, height] = [between(12, 18), between(6, 8)];
      [faces, color, radius] = [
        rectangle(width, height),
        paper(),
        Math.hypot(width, height) / 2,
      ];
    } else if (kind < 0.6) {
      const r = between(4, 6);
      [faces, color, radius] = [polygon(14, () => r), paper(), r];
    } else if (kind < 0.78) {
      [faces, material, color, radius] = [
        rectangle(10, 10),
        FOIL,
        random() < 0.6 ? GOLD : SILVER,
        7.1,
      ];
    } else if (kind < 0.88) {
      const r = between(7, 9);
      [faces, material, color, radius] = [
        polygon(10, (index) => (index % 2 ? r * 0.45 : r)),
        FOIL,
        random() < 0.5 ? GOLD : SILVER,
        r,
      ];
    } else {
      const length = between(40, 60);
      [faces, color, radius] = [
        streamer(length, 4.5, between(2.2, 3.6)),
        paper(),
        length / 2,
      ];
    }
    const rise = between(0.3, 0.45);
    const piece = {
      faces,
      material,
      color,
      delay: between(0, 0.25),
      rise,
      fall: between(1.6, CONFETTI_DURATION - 0.75 - rise),
      peak: between(250, 950),
      launch: [
        scene.launch.x + between(-40, 40),
        scene.launch.y + between(-40, 40),
        0,
      ] as V3,
      yaw: between(0, Math.PI * 2),
      spin: between(-9, 9),
      wobble: between(0.9, 1.5),
      wobbleSpeed: between(7, 13),
      phase: between(0, Math.PI * 2),
      rest: rotZ(between(0, Math.PI * 2)),
    };
    // Somewhere clear on the card, whole; a piece with no room left is not thrown.
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = between(radius, scene.width - radius);
      const y = between(radius, scene.height - radius);
      if (scene.clear(x, y, radius)) {
        thrown.push({ ...piece, land: [x, y, 0] });
        break;
      }
    }
  }
  return thrown;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Where a piece is at `time`, as world-space faces; null before its throw. */
/** Lying still on the card: from then on, `place` gives the same faces. */
function landed(piece: Piece, time: number): boolean {
  return time - piece.delay >= piece.rise + piece.fall;
}

function place(piece: Piece, time: number): Face[] | null {
  const t = time - piece.delay;
  if (t <= 0) {
    return null;
  }
  const { launch, land } = piece;
  // The highest point is above the middle of the way.
  const middle = add(launch, scale(sub(land, launch), 0.55));
  let position: V3;
  // 1 while it tumbles, 0 once it lies still.
  let unsettled: number;
  if (t < piece.rise) {
    // Out of the popper: fast, up towards the camera.
    const k = easeOut(t / piece.rise);
    position = [
      launch[0] + (middle[0] - launch[0]) * k,
      launch[1] + (middle[1] - launch[1]) * k,
      piece.peak * k,
    ];
    unsettled = 1;
  } else {
    // Fluttering down, swaying, onto its landing spot.
    const k = Math.min(1, (t - piece.rise) / piece.fall);
    const along = smooth(k);
    const sway = (1 - k) * 22 * Math.sin(piece.phase + t * 3.1);
    position = [
      middle[0] + (land[0] - middle[0]) * along + sway,
      middle[1] + (land[1] - middle[1]) * along,
      piece.peak * (1 - k * k * (1.6 - 0.6 * k)),
    ];
    unsettled = 1 - smooth(k) ** 0.6;
  }
  // Just above the card, so that its shadow shows at its edge.
  position = [position[0], position[1], Math.max(position[2], 0) + 0.8];
  const tumble = mmul(
    rotZ(piece.yaw + piece.spin * t * unsettled),
    mmul(
      rotX(
        unsettled * piece.wobble * Math.sin(piece.phase + piece.wobbleSpeed * t)
      ),
      rotY(
        unsettled *
          piece.wobble *
          Math.cos(piece.phase * 1.7 + piece.wobbleSpeed * 0.8 * t)
      )
    )
  );
  const orientation = mmul(tumble, piece.rest);
  return piece.faces.map((face) =>
    face.map((vertex) => add(position, mul(orientation, vertex)))
  );
}

// ---------------------------------------------------------------- drawing
function projector(scene: ConfettiScene) {
  const centre = { x: scene.width / 2, y: scene.height / 2 };
  return ([x, y, z]: V3): Point => {
    const k = CAMERA / (CAMERA - z);
    return [centre.x + (x - centre.x) * k, centre.y + (y - centre.y) * k];
  };
}

function path(ctx: SKRSContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/**
 * Clips to the points' box, grown by three blur radii. A canvas filter blurs
 * a layer as large as the clip: the whole card otherwise, which made a frame
 * forty times slower.
 */
export function clipAround(
  ctx: SKRSContext2D,
  points: Point[],
  radius: number
): void {
  const margin = Math.ceil(radius * 3) + 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const left = Math.floor(Math.min(...xs)) - margin;
  const top = Math.floor(Math.min(...ys)) - margin;
  ctx.beginPath();
  ctx.rect(
    left,
    top,
    Math.ceil(Math.max(...xs)) + margin - left,
    Math.ceil(Math.max(...ys)) + margin - top
  );
  ctx.clip();
}

const highest = (faces: Face[]) =>
  Math.max(...faces.flat().map((vertex) => vertex[2]));

function shade(
  scene: ConfettiScene,
  face: Face,
  piece: Piece
): { fill: string; specular: number; centre: V3 } {
  let normal = norm(
    cross(sub(face[1]!, face[0]!), sub(face[3] ?? face[2]!, face[0]!))
  );
  const centre = scale(face.reduce(add, [0, 0, 0]), 1 / face.length);
  const view = norm(sub([scene.width / 2, scene.height / 2, CAMERA], centre));
  // Paper and foil have two sides: light the one the camera sees.
  const back = dot(normal, view) < 0;
  if (back) {
    normal = scale(normal, -1);
  }
  const { material } = piece;
  // Holographic foil: the hue turns with the angle to the lights.
  const color = material.metal
    ? hsl(
        (dot(normal, KEY) * 540 + dot(normal, FILL) * 220 + piece.phase * 57) %
          360,
        0.75,
        0.62
      )
    : piece.color;
  const diffuse =
    0.32 +
    0.62 * Math.max(0, dot(normal, KEY)) +
    0.18 * Math.max(0, dot(normal, FILL));
  const specular =
    material.specular *
    Math.max(0, dot(normal, norm(add(KEY, view)))) ** material.shininess;
  const highlight: Rgb = material.metal ? color : [255, 255, 255];
  const lit = (i: number) =>
    Math.min(
      255,
      Math.round(
        color[i]! * diffuse * (back ? 0.85 : 1) + highlight[i]! * specular
      )
    );
  return { fill: rgb([lit(0), lit(1), lit(2)]), specular, centre };
}

/** A four-pointed sparkle where a foil catches the light. */
function glint(ctx: SKRSContext2D, [x, y]: Point, strength: number): void {
  const length = 10 + 26 * Math.min(1, strength);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(x, y, 0, x, y, length * 0.45);
  glow.addColorStop(0, `rgba(255,250,235,${Math.min(0.9, strength * 0.7)})`);
  glow.addColorStop(1, "rgba(255,250,235,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - length, y - length, length * 2, length * 2);
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    const ray = ctx.createLinearGradient(
      x - dx * length,
      y - dy * length,
      x + dx * length,
      y + dy * length
    );
    ray.addColorStop(0, "rgba(255,255,255,0)");
    ray.addColorStop(0.5, `rgba(255,255,255,${Math.min(1, strength)})`);
    ray.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ray;
    ctx.fillRect(
      x - dx * length - dy * 0.8,
      y - dy * length - dx * 0.8,
      dx * length * 2 + dy * 1.6,
      dy * length * 2 + dx * 1.6
    );
  }
  ctx.restore();
}

/** Out-of-focus lights drifting in front of the camera, gone by the end. */
function bokeh(ctx: SKRSContext2D, scene: ConfettiScene, time: number): void {
  const random = randomFrom(99);
  const fade = Math.sin(
    Math.PI * Math.min(1, time / (CONFETTI_DURATION * 0.8))
  );
  const tints: Rgb[] = [
    [255, 214, 140],
    [255, 160, 200],
    [170, 200, 255],
  ];
  for (let i = 0; i < 9; i++) {
    const x = random() * scene.width + (random() - 0.5) * 120 * time;
    const y = random() * scene.height + 40 * time;
    const radius = 25 + random() * 45;
    const tint = tints[i % tints.length]!.join(",");
    const alpha = (0.1 + random() * 0.12) * fade;
    const light = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius);
    light.addColorStop(0, `rgba(${tint},${alpha.toFixed(3)})`);
    light.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFrame(
  ctx: SKRSContext2D,
  scene: ConfettiScene,
  thrown: Piece[],
  time: number
): void {
  const project = projector(scene);
  ctx.clearRect(0, 0, scene.width, scene.height);
  const placed = thrown
    .flatMap((piece) => {
      const faces = place(piece, time);
      return faces ? [{ piece, faces, height: highest(faces) }] : [];
    })
    // Far ones first.
    .sort((a, b) => a.height - b.height);

  // Shadows on the card, along the key light: softer and paler the higher.
  for (const { faces, height } of placed) {
    const radius = Math.min(14, 0.4 + height * 0.025);
    const shadow = faces.map((face) =>
      face.map(([x, y, z]) =>
        project([x - (KEY[0] / KEY[2]) * z, y - (KEY[1] / KEY[2]) * z, 0])
      )
    );
    ctx.save();
    clipAround(ctx, shadow.flat(), radius);
    ctx.filter = `blur(${radius.toFixed(1)}px)`;
    ctx.fillStyle = `rgba(0,0,0,${(0.42 * (1 - Math.min(0.85, height / 900))).toFixed(3)})`;
    for (const points of shadow) {
      path(ctx, points);
      ctx.fill();
    }
    ctx.restore();
  }

  const sparkles: [Point, number][] = [];
  for (const { piece, faces, height } of placed) {
    // The nearest out of focus.
    const defocus = Math.max(0, (height - 520) / 90);
    // Motion trails: the piece a few instants earlier, fading. They show while
    // it is fast, as in slow motion, and vanish as it settles: a landed piece
    // was already there.
    const trails = [3, 2, 1].flatMap((steps) => {
      const before = time - steps * 0.011;
      const earlier = landed(piece, before) ? null : place(piece, before);
      return earlier ? [{ steps, earlier }] : [];
    });
    ctx.save();
    if (defocus > 0) {
      // Around the trails too, or the clip cuts them off.
      const drawn = [faces, ...trails.map((trail) => trail.earlier)];
      clipAround(ctx, drawn.flat(2).map(project), defocus);
      ctx.filter = `blur(${defocus.toFixed(1)}px)`;
    }
    for (const { steps, earlier } of trails) {
      ctx.globalAlpha = 0.16 * (4 - steps);
      for (const face of earlier) {
        path(ctx, face.map(project));
        ctx.fillStyle = shade(scene, face, piece).fill;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // A streamer's far facets first.
    const ordered = [...faces].sort(
      (a, b) =>
        a.reduce((sum, v) => sum + v[2], 0) -
        b.reduce((sum, v) => sum + v[2], 0)
    );
    for (const face of ordered) {
      path(ctx, face.map(project));
      const shaded = shade(scene, face, piece);
      ctx.fillStyle = shaded.fill;
      ctx.fill();
      if (piece.material.metal && shaded.specular > 0.18) {
        sparkles.push([
          project(shaded.centre),
          Math.min(1.2, shaded.specular * 1.8),
        ]);
      }
    }
    ctx.restore();
  }
  for (const [at, strength] of sparkles) {
    glint(ctx, at, strength);
  }
  bokeh(ctx, scene, time);
}

// ---------------------------------------------------------------- the API
/**
 * The confetti over a transparent background, one PNG per frame over the
 * throw's 3 s, the last ones lying still once every piece has landed. The same
 * palette always gives the same frames, which
 * suit every card of the scene. Each frame takes some 40 ms of canvas work:
 * the bot's other tasks run between two frames.
 */
export async function renderConfetti(
  scene: ConfettiScene,
  colors: readonly Rgb[],
  frames = FRAMES
): Promise<Buffer[]> {
  if (frames < 2) {
    throw new RangeError("The throw takes two frames at least");
  }
  const thrown = pieces(scene, colors);
  const canvas = createCanvas(scene.width, scene.height);
  const ctx = canvas.getContext("2d");
  const rendered: Buffer[] = [];
  for (let f = 0; f < frames; f++) {
    drawFrame(ctx, scene, thrown, (CONFETTI_DURATION * f) / (frames - 1));
    // Encoded off the main thread, which serves the bot meanwhile.
    rendered.push(await canvas.encode("png"));
  }
  return rendered;
}

/**
 * In a loop, how long the last frame stays before the next throw. The throw
 * already ends on some 0.5 s of landed confetti (the last piece lands by
 * 2.5 s): about 2 s of rest in all.
 */
export const CONFETTI_REST_MS = 1500;

/**
 * In a loop, the frames over which the landed confetti fade out before the
 * next throw (some 0.3 s): without them, they vanish at once.
 */
export const CONFETTI_FADE_FRAMES = 9;

export interface AnimateOptions {
  /**
   * Replay forever, resting on the landed confetti between two throws (the
   * default), or play once and stay on them.
   */
  loop?: boolean;
}

/**
 * A card under the confetti, as an animated WebP replayed forever (the landed
 * confetti rest, fade out, then are thrown again), or played once with
 * `{ loop: false }`. Its first frame is the last one, shown for one frame:
 * Discord shows the first frame when animations are off, so they still see
 * the confetti landed. Composed by libvips in one pass, off the main thread,
 * the card tiled under every frame.
 */
export async function animateCard(
  card: Buffer,
  confetti: readonly Buffer[],
  { loop = true }: AnimateOptions = {}
): Promise<Buffer> {
  if (confetti.length < 2) {
    throw new RangeError("The throw takes two frames at least");
  }
  // Loaded on first use: without libvips, only the animation fails, and the
  // callers attach their still card.
  const { default: sharp } = await import("sharp");
  // A card or two a day: libvips would keep up to 50 MB for nothing.
  sharp.cache(false);
  const [frame, under] = await Promise.all(
    [confetti[0]!, card].map((image) => sharp(image).metadata())
  );
  if (frame!.width !== under!.width || frame!.height !== under!.height) {
    throw new RangeError(
      `The card is ${under!.width}×${under!.height}, the confetti ${frame!.width}×${frame!.height}`
    );
  }
  const landed = confetti.at(-1)!;
  // In a loop, the landed confetti fade out after the still first frame, so
  // that each new throw starts from the bare card without a jump.
  const fading = loop
    ? await Promise.all(
        Array.from({ length: CONFETTI_FADE_FRAMES }, (_, i) =>
          sharp(landed)
            .ensureAlpha()
            .linear(
              [1, 1, 1, 1 - (i + 1) / (CONFETTI_FADE_FRAMES + 1)],
              [0, 0, 0, 0]
            )
            .png()
            .toBuffer()
        )
      )
    : [];
  const sequence = [landed, ...fading, ...confetti];
  const step = Math.round((CONFETTI_DURATION * 1000) / (confetti.length - 1));
  // In a loop, the last frame rests, then the first (the same image) leads
  // into the next throw. Played once, it simply stays.
  const delay = sequence.map((_, i) =>
    loop && i === sequence.length - 1 ? CONFETTI_REST_MS : step
  );
  return sharp(sequence, { join: { animated: true } })
    .composite([
      { input: card, tile: true, gravity: "northwest", blend: "dest-over" },
    ])
    .webp({ quality: 85, loop: loop ? 0 : 1, delay, effort: 4 })
    .toBuffer();
}
