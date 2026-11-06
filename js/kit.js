// Mystery Face's part of the shared kits (js/coach.js, js/profile.js: never edit those here):
// the achievement list, the rules sheet (our own words), and the quick question chips.

const won = (c) => !!(c.last && c.last.won);
const ex = (c) => (c.last && c.last.extra) || {};
export const ACHIEVEMENTS = [
  { id: 'first', title: 'First win', desc: 'Win an online game', test: (c) => c.stats.wins >= 1 },
  { id: 'sharp', title: 'Sharp eye', desc: 'Win after asking 3 questions or fewer', test: (c) => won(c) && ex(c).asked <= 3 },
  { id: 'clutch', title: 'Last life', desc: 'Win with 3 lives after two wrong guesses', test: (c) => won(c) && ex(c).livesLeft === 1 && ex(c).maxLives === 3 },
  { id: 'own', title: 'Home crowd', desc: 'Play a game with your own people', test: (c) => !!ex(c).custom },
  { id: 'big', title: 'Full house', desc: 'Win on a 30-face board', test: (c) => won(c) && ex(c).n >= 30 },
  { id: 'streak', title: 'Hat trick', desc: 'Win 3 in a row', test: (c) => c.stats.bestStreak >= 3 },
];

// Quick questions: plain looks questions anyone can answer from a picture, then one per kind of
// person on the board (tags from the decks). A tag question carries its tag, so the end-of-game
// review can check the answer against the face that was revealed.
export const LOOKS = ['Glasses?', 'Beard?', 'Hat?', 'Smiling?', 'Long hair?', 'Dark hair?', 'Blond hair?', 'Earrings?', 'Older than 50?', 'Real person?'];
const TAGQ = {
  actor: 'Are they an actor?', actress: 'Are they an actor?', film: 'Known for films?', movie: 'Known for films?',
  music: 'A musician?', musician: 'A musician?', singer: 'A singer?', rapper: 'A rapper?', band: 'In a band?',
  sports: 'Known for sports?', athlete: 'Known for sports?', football: 'Football?', basketball: 'Basketball?', soccer: 'Soccer?',
  history: 'From history?', historical: 'From history?', politics: 'A politician?', politician: 'A politician?', president: 'A president?',
  tv: 'Known for TV?', internet: 'Famous online?', youtube: 'A YouTuber?', comedy: 'A comedian?', comedian: 'A comedian?',
  cartoon: 'A cartoon?', animated: 'A cartoon?', fictional: 'Made up (fictional)?', character: 'A character?',
  science: 'A scientist?', scientist: 'A scientist?', business: 'In business?', royalty: 'Royalty?', art: 'An artist?', artist: 'An artist?',
  writer: 'A writer?', author: 'A writer?', space: 'An astronaut?', robot: 'A robot?', monster: 'A monster?', alien: 'An alien?', blob: 'A blob?',
};
export function tagQuestion(tag) {
  return TAGQ[tag] || `Known for ${tag.replace(/[-_]/g, ' ')}?`;
}
export function tagLabel(tag) {
  const t = tag.replace(/[-_]/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rules() {
  return {
    title: 'How to play Mystery Face',
    sections: [
      { id: 'goal', short: 'Goal', title: 'Goal', html: `<p>Two players, the same board of faces. Each of you secretly picks one face. Take turns asking yes/no questions and flip down the faces that can't be the other player's.</p>
        <p>Name the other player's face first to win the round.</p>` },
      { id: 'start', short: 'Start', title: 'Before you play', html: `<ul><li><b>Don't know someone?</b> Both of you tap any faces you don't recognise, then <b>Swap</b>: they're replaced from the deck. Press <b>Ready</b> when you know everyone.</li>
        <li><b>Pick</b> your mystery face (or <b>Random</b>) and lock it in. Both of you may pick the same face.</li></ul>
        <p class="tip">Your pick is locked with a code when you choose it and checked when the round ends, so nobody can switch faces halfway.</p>` },
      { id: 'turn', short: 'Turns', title: 'A turn', html: `<ol><li>You <b>ask</b> one yes/no question, like "Glasses?". Type it, or tap a quick question.</li>
        <li>The other player <b>answers</b>: Yes, No or Not sure.</li>
        <li>You <b>flip down</b> every face the answer rules out (tap a face; tap again to stand it back up), then tap <b>Done</b>.</li>
        <li>Now the other player asks, you answer, they flip. And so on.</li></ol>
        <p class="tip">Your flips are yours alone: the other player only sees how many faces you have left.</p>` },
      { id: 'guess', short: 'Guessing', title: 'Guessing', html: `<p>On your turn you can make a final guess instead of asking (or after flipping, instead of Done). Tap <b>Guess</b>, then the face.</p>
        <ul><li>Right: you win the round.</li><li>Wrong: you lose the round. With <b>3 lives</b> (Settings) a wrong guess costs a life and the turn passes.</li></ul>` },
      { id: 'end', short: 'End', title: 'End of the round', html: `<p>Both faces are shown, every pick is checked against its lock, and the whole question log is listed. If a "kind" question (like "Are they an actor?") was answered against the face's kind, the review points it out.</p>
        <p><b>Play again</b> keeps the score and the deck, deals new faces, and the other player starts.</p>` },
      { id: 'same', short: 'Same screen', title: 'Same screen', html: `<p>Two players at one phone or laptop. Ask and answer out loud; the screen says whose step it is.</p>
        <ul><li>When picking, the other player looks away. Your face is then hidden: press and hold <b>Your face</b> to peek.</li>
        <li>Each player has their own board. On a phone switch with <b>Player 1 / Player 2</b>; on a laptop they sit side by side.</li></ul>` },
      { id: 'people', short: 'Your people', title: 'Your own people', html: `<p>In <b>People</b>, make a set from photos (or just names: they show as coloured name tiles). Photos are cut square and made small on your phone before they're saved.</p>
        <ul><li>Sign in to keep your sets on your account and see them on any device.</li><li>A set you play online is shared only with the friend in that room, and is deleted with the room.</li></ul>` },
    ],
  };
}
