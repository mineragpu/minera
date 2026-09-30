import type { Random } from '../random.ts';

const TOPICS = [
  'photosynthesis', 'a black hole', 'the water cycle', 'a volcano', 'plate tectonics', 'a rainbow', 'gravity',
  'an eclipse', 'a hurricane', 'the immune system', 'DNA', 'a glacier', 'the tides', 'a thunderstorm',
  'a coral reef', 'the northern lights', 'a comet', 'an earthquake', 'a telescope', 'a microscope', 'a battery',
  'a magnet', 'a lighthouse', 'a suspension bridge', 'a windmill', 'a compass', 'a sundial', 'fermentation',
] as const;

const ACTIVITIES = [
  'learning to cook', 'starting a small garden', 'running a first 5k', 'sleeping better', 'learning a new language',
  'keeping a journal', 'studying for exams', 'training a puppy', 'baking bread', 'reading more books',
  'saving water at home', 'organizing a small room', 'planning a picnic', 'writing a short story',
  'taking better photos', 'learning to swim', 'packing for a trip', 'caring for houseplants', 'staying focused',
  'making new friends in a new city',
] as const;

const ANIMALS = [
  'octopuses', 'honeybees', 'penguins', 'elephants', 'owls', 'dolphins', 'tortoises', 'hummingbirds', 'wolves',
  'koalas', 'salmon', 'crows', 'giraffes', 'otters', 'chameleons', 'bats',
] as const;

const SCENES = [
  'the first snow', 'an old library', 'a quiet harbor', 'a city at dawn', 'a summer storm', 'a lost key',
  'a paper boat', 'the last train home', 'a lighthouse keeper', 'autumn leaves', 'a mountain lake',
  'a lantern in the fog',
] as const;

const PAIRS = [
  ['weather', 'climate'], ['a virus', 'a bacterium'], ['speed', 'velocity'], ['a lake', 'a pond'],
  ['an alligator', 'a crocodile'], ['a moth', 'a butterfly'], ['baking soda', 'baking powder'],
  ['a comet', 'an asteroid'], ['a frog', 'a toad'], ['mass', 'weight'], ['a sea', 'an ocean'],
  ['a hill', 'a mountain'],
] as const;

const TRAITS = ['sleepy', 'curious', 'brave', 'tiny', 'fluffy', 'grumpy', 'clever', 'speedy'] as const;
const PETS = ['cat', 'dog', 'hamster', 'parrot', 'rabbit', 'turtle', 'goldfish', 'hedgehog'] as const;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[random.int(items.length)];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
}

const TEMPLATES: readonly ((random: Random) => string)[] = [
  (random) => `Explain ${pick(TOPICS, random)} in two sentences.`,
  (random) => `Give me three tips for ${pick(ACTIVITIES, random)}.`,
  (random) => `Write a four-line poem about ${pick(SCENES, random)}.`,
  (random) => {
    const [a, b] = pick(PAIRS, random);
    return `What is the difference between ${a} and ${b}?`;
  },
  (random) => `Describe ${pick(TOPICS, random)} to a ten-year-old.`,
  (random) => `List three interesting facts about ${pick(ANIMALS, random)}.`,
  (random) => `Suggest a name for a ${pick(TRAITS, random)} ${pick(PETS, random)} and say why it fits.`,
  (random) => `Why is ${pick(ACTIVITIES, random)} worth trying? Answer briefly.`,
];

/**
 * A prompt of the kind visitors send, for seeding the canary bank. Seeds must read like ordinary
 * traffic, or a node could answer them honestly and everything else carelessly.
 */
export function seedPrompt(random: Random): string {
  return pick(TEMPLATES, random)(random);
}
