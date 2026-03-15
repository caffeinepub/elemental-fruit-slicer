# Elemental Fruit Slicer

## Current State
New project. No existing code.

## Requested Changes (Diff)

### Add
- Full 2D fruit-slicing game on HTML5 Canvas
- Elemental Fruits system:
  - **Frost Pear**: slicing triggers a screen-wide slow-motion effect (time scale 0.3x) for 3 seconds with a blue frost shader overlay
  - **Volcanic Plum**: slicing triggers a chain reaction that shatters nearby fruits within radius, each shattering fruit adds score
  - Standard fruits: Apple, Watermelon, Orange, Mango (sliced for points)
- **Gravity Core** (replaces bombs): if sliced, inverts gravity so all fruits fall from the top downward (or upward if already inverted); visual indicator shows current gravity direction
- **Zen Stone Health UI**: 3 stones displayed at bottom; each missed fruit cracks a stone further (3 cracks = stone destroyed); destroyed stone glows red; all 3 stones destroyed = game over
- Mouse/touch drag to slice mechanic using canvas pointer events
- Score counter with combo multiplier for quick successive slices
- Particle effects for slicing (juice splatter), frost freeze effect, volcanic explosion
- Game states: Menu, Playing, Game Over with high score
- Backend: save high scores per session

### Modify
- N/A (new project)

### Remove
- N/A (new project)

## Implementation Plan
1. Generate Motoko backend with high score storage (save/get leaderboard)
2. Build Canvas game engine with requestAnimationFrame loop
3. Implement fruit spawning system with weighted random selection including elemental fruits and gravity cores
4. Implement slice detection via mouse/touch drag vectors
5. Implement Frost Pear slow-motion: time scale + blue overlay shader effect
6. Implement Volcanic Plum chain reaction: proximity radius check on slice
7. Implement Gravity Core: toggle gravity direction on slice
8. Implement Zen Stone UI: 3 stones with crack states (0-3), glow red on destruction, game over at 3 destroyed
9. Particle system for juice splatter, frost crystals, lava burst
10. Score system with combo tracking
11. Menu and game over screens
12. Wire backend for high score save/load
