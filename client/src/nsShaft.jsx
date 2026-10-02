import React, { useState, useEffect, useRef } from 'react';
import './nsShaft.css';

// Game Board Dimensions
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;

// Player Parameters
const PLAYER_SIZE = 24;

// Platform Dimensions
const PLATFORM_WIDTH = 96;
const PLATFORM_HEIGHT = 14;

// Platform Types
const PLATFORM_TYPES = {
  NORMAL: 'NORMAL',               // Green: Safe platform
  SPIKE: 'SPIKE',                 // Red spikes: Instant Game Over!
  TRAMPOLINE: 'TRAMPOLINE',       // Blue Spring: Bounces player high
  CONVEYOR_LEFT: 'CONVEYOR_LEFT', // Orange <<: Super slippery slide left
  CONVEYOR_RIGHT: 'CONVEYOR_RIGHT',// Orange >>: Super slippery slide right
  TRAP: 'TRAP',                   // Flip Trap / False Stairs: Drops down when stepped on
};

function nsShaft({
  radioPlaying,
  radioLoading,
  channels,
  selectedChannel,
  onSelectChannel,
  onToggleRadio,
  radioError,
}) {
  const canvasRef = useRef(null);

  // UI & Excel Ribbon States
  const [activeTab, setActiveTab] = useState('Home');
  const [isRadioMenuOpen, setIsRadioMenuOpen] = useState(false);
  const [gameState, setGameState] = useState('IDLE'); // 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [hp, setHp] = useState(1);
  const [activeSheet, setActiveSheet] = useState('NS-Shaft.xlsx');

  // Input Control Refs
  const touchLeftRef = useRef(false);
  const touchRightRef = useRef(false);
  const keysRef = useRef({ left: false, right: false });

  // Load High Score on initial mount
  useEffect(() => {
    const saved = localStorage.getItem('ns_shaft_excel_highscore');
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keysRef.current.left = true;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keysRef.current.right = true;
      if (e.code === 'Space') {
        if (gameState === 'IDLE' || gameState === 'GAMEOVER') startGame();
      }
      if (e.code === 'KeyP' && (gameState === 'PLAYING' || gameState === 'PAUSED')) {
        togglePause();
      }
    };

    const handleKeyUp = (e) => {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keysRef.current.left = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keysRef.current.right = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });

    let animationFrameId;
    let lastTime = performance.now();

    // Slippery Player Physics State
    const player = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: 90,
      vx: 0,
      vy: 0,
      accel: 0.9,            // Acceleration rate
      friction: 0.84,         // Extra slippery low friction drift
      gravity: 0.45,
      maxTerminalVelocity: 11,
      hp: 1,                 // 1 HP Instant Death Mode
      onPlatform: null,
      facing: 'right',
    };

    let currentScore = score;
    let baseScrollSpeed = 2.0;
    let platformIdCounter = 0;
    let spawnDistanceCounter = 0;

    let lastPlatformX = CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2;

    const generatePlatform = (forcedY = CANVAS_HEIGHT + PLATFORM_HEIGHT) => {
      const maxReach = 180;
      const minX = Math.max(16, lastPlatformX - maxReach);
      const maxX = Math.min(CANVAS_WIDTH - PLATFORM_WIDTH - 16, lastPlatformX + maxReach);
      const x = minX + Math.random() * (maxX - minX);

      lastPlatformX = x;

      const rand = Math.random();
      let type = PLATFORM_TYPES.NORMAL;
      if (rand < 0.35) type = PLATFORM_TYPES.NORMAL;
      else if (rand < 0.50) type = PLATFORM_TYPES.SPIKE;
      else if (rand < 0.65) type = PLATFORM_TYPES.CONVEYOR_LEFT;
      else if (rand < 0.80) type = PLATFORM_TYPES.CONVEYOR_RIGHT;
      else if (rand < 0.90) type = PLATFORM_TYPES.TRAMPOLINE;
      else type = PLATFORM_TYPES.TRAP;

      return {
        id: ++platformIdCounter,
        x,
        y: forcedY,
        type,
        visited: false,
        springAnim: 0,
        trapOpen: false,
        trapAngle: 0,
      };
    };

    // Initial starting platforms
    let platforms = [
      { id: ++platformIdCounter, x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2, y: 180, type: PLATFORM_TYPES.NORMAL, visited: true, springAnim: 0, trapOpen: false, trapAngle: 0 },
      { id: ++platformIdCounter, x: 80, y: 320, type: PLATFORM_TYPES.NORMAL, visited: false, springAnim: 0, trapOpen: false, trapAngle: 0 },
      { id: ++platformIdCounter, x: 280, y: 460, type: PLATFORM_TYPES.NORMAL, visited: false, springAnim: 0, trapOpen: false, trapAngle: 0 },
    ];

    const update = (dt) => {
      const scrollSpeed = baseScrollSpeed + Math.floor(currentScore / 12) * 0.18;

      // Handle Steering Inputs with Momentum (Keyboard or Touch/Click Buttons)
      const moveLeft = keysRef.current.left || touchLeftRef.current;
      const moveRight = keysRef.current.right || touchRightRef.current;

      if (moveLeft) {
        player.vx -= player.accel;
        player.facing = 'left';
      } else if (moveRight) {
        player.vx += player.accel;
        player.facing = 'right';
      }

      // Slippery Conveyor & Surface Friction Drift
      if (player.onPlatform) {
        if (player.onPlatform.type === PLATFORM_TYPES.CONVEYOR_LEFT) {
          player.vx -= 1.6; // Strong slippery left slide
        } else if (player.onPlatform.type === PLATFORM_TYPES.CONVEYOR_RIGHT) {
          player.vx += 1.6; // Strong slippery right slide
        }
      }

      // Apply low friction for slippery sliding inertia
      player.vx *= player.friction;

      // Physics integration
      player.x += player.vx;
      player.vy = Math.min(player.vy + player.gravity, player.maxTerminalVelocity);
      player.y += player.vy;

      // Side Wall Bouncing/Boundaries
      if (player.x < 4) {
        player.x = 4;
        player.vx = 0;
      }
      if (player.x + PLAYER_SIZE > CANVAS_WIDTH - 4) {
        player.x = CANVAS_WIDTH - PLAYER_SIZE - 4;
        player.vx = 0;
      }

      // Scroll Platforms Up
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        p.y -= scrollSpeed;

        if (p.springAnim > 0) p.springAnim -= 0.8;

        if (p.trapOpen && p.trapAngle < Math.PI / 2) {
          p.trapAngle += 0.14;
        }
      }

      // Filter off-screen platforms
      platforms = platforms.filter((p) => p.y + PLATFORM_HEIGHT > -30);

      // Spawn next platform
      spawnDistanceCounter += scrollSpeed;
      if (spawnDistanceCounter >= 92) {
        spawnDistanceCounter = 0;
        platforms.push(generatePlatform());
      }

      // 1. INSTANT GAME OVER ON CEILING SPIKES
      const CEILING_SPIKE_HEIGHT = 28;
      if (player.y <= CEILING_SPIKE_HEIGHT) {
        player.hp = 0;
        setHp(0);
        triggerGameOver(currentScore);
        return;
      }

      // Platform Collision Detection
      let currentlyStandingOn = null;

      if (player.vy >= 0) {
        for (let i = 0; i < platforms.length; i++) {
          const p = platforms[i];

          if (p.type === PLATFORM_TYPES.TRAP && p.trapOpen) continue;

          const feetY = player.y + PLAYER_SIZE;
          const prevFeetY = feetY - player.vy - scrollSpeed;

          const horizontalOverlap =
            player.x + PLAYER_SIZE - 4 > p.x && player.x + 4 < p.x + PLATFORM_WIDTH;

          if (
            horizontalOverlap &&
            prevFeetY <= p.y + 5 &&
            feetY >= p.y &&
            feetY <= p.y + PLATFORM_HEIGHT + 6
          ) {
            // Landed on platform
            currentlyStandingOn = p;
            player.y = p.y - PLAYER_SIZE;
            player.vy = -scrollSpeed;

            // Grant score on landing
            if (!p.visited) {
              p.visited = true;
              currentScore += 1;
              setScore(currentScore);
            }

            // 2. INSTANT GAME OVER ON SPIKE PLATFORMS
            if (p.type === PLATFORM_TYPES.SPIKE) {
              player.hp = 0;
              setHp(0);
              triggerGameOver(currentScore);
              return;
            } else if (p.type === PLATFORM_TYPES.TRAMPOLINE) {
              p.springAnim = 12;
              player.vy = -10.0; // Spring bounce
              currentlyStandingOn = null;
            } else if (p.type === PLATFORM_TYPES.TRAP) {
              p.trapOpen = true; // Drop trapdoor
              currentlyStandingOn = null;
            }
            break;
          }
        }
      }

      player.onPlatform = currentlyStandingOn;

      // Game Over check: Fell off bottom shaft
      if (player.y > CANVAS_HEIGHT + 24) {
        player.hp = 0;
        setHp(0);
        triggerGameOver(currentScore);
      }
    };

    const triggerGameOver = (finalScore) => {
      setGameState('GAMEOVER');
      setHighScore((prev) => {
        const newHigh = Math.max(prev, finalScore);
        localStorage.setItem('ns_shaft_excel_highscore', newHigh.toString());
        return newHigh;
      });
    };

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Excel Grid Cell Lines background
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const cellW = 32;
      const cellH = 20;

      for (let x = 0; x < CANVAS_WIDTH; x += cellW) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += cellH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Ceiling Hazard Spikes
      const NUM_SPIKES = 24;
      const spikeW = CANVAS_WIDTH / NUM_SPIKES;
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 0; i <= NUM_SPIKES; i++) {
        const x = i * spikeW;
        ctx.lineTo(x - spikeW / 2, 22);
        ctx.lineTo(x, 0);
      }
      ctx.fill();

      // Excel Red Hazard Warning Line
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(0, 22, CANVAS_WIDTH, 4);

      // Render Platforms
      platforms.forEach((p) => {
        ctx.save();

        if (p.type === PLATFORM_TYPES.NORMAL) {
          // Normal Green Platform
          ctx.fillStyle = '#107c41';
          ctx.fillRect(p.x, p.y, PLATFORM_WIDTH, PLATFORM_HEIGHT);
          ctx.strokeStyle = '#0b592e';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x, p.y, PLATFORM_WIDTH, PLATFORM_HEIGHT);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(p.x + 2, p.y + 2, PLATFORM_WIDTH - 4, 3);
        } else if (p.type === PLATFORM_TYPES.SPIKE) {
          // Spike Platform (Instant Kill Red)
          ctx.fillStyle = '#475569';
          ctx.fillRect(p.x, p.y + 5, PLATFORM_WIDTH, PLATFORM_HEIGHT - 5);

          ctx.fillStyle = '#dc2626';
          const pSpikeW = 8;
          for (let sx = p.x; sx < p.x + PLATFORM_WIDTH; sx += pSpikeW) {
            ctx.beginPath();
            ctx.moveTo(sx, p.y + 5);
            ctx.lineTo(sx + pSpikeW / 2, p.y - 4);
            ctx.lineTo(sx + pSpikeW, p.y + 5);
            ctx.fill();
          }
        } else if (p.type === PLATFORM_TYPES.CONVEYOR_LEFT || p.type === PLATFORM_TYPES.CONVEYOR_RIGHT) {
          // Slippery Conveyor Platform
          const isLeft = p.type === PLATFORM_TYPES.CONVEYOR_LEFT;
          ctx.fillStyle = isLeft ? '#0284c7' : '#ea580c';
          ctx.fillRect(p.x, p.y, PLATFORM_WIDTH, PLATFORM_HEIGHT);

          // Moving Striped Band
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.35;
          const animOffset = (Date.now() / 20) % 12;
          const shift = isLeft ? -animOffset : animOffset;

          for (let sx = p.x - 12 + shift; sx < p.x + PLATFORM_WIDTH; sx += 12) {
            if (sx >= p.x && sx + 6 <= p.x + PLATFORM_WIDTH) {
              ctx.fillRect(sx, p.y, 6, PLATFORM_HEIGHT);
            }
          }
          ctx.globalAlpha = 1.0;

          // Direction Arrow Text
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(isLeft ? '<<< SLIDE' : 'SLIDE >>>', p.x + 14, p.y + 11);
        } else if (p.type === PLATFORM_TYPES.TRAMPOLINE) {
          // Trampoline Platform
          ctx.fillStyle = '#1e40af';
          ctx.fillRect(p.x, p.y + 6, PLATFORM_WIDTH, PLATFORM_HEIGHT - 6);

          const springOffset = p.springAnim || 0;
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(p.x + 2, p.y - springOffset, PLATFORM_WIDTH - 4, 6);
          ctx.strokeStyle = '#60a5fa';
          ctx.strokeRect(p.x + 2, p.y - springOffset, PLATFORM_WIDTH - 4, 6);
        } else if (p.type === PLATFORM_TYPES.TRAP) {
          // Trapdoor Platform
          if (!p.trapOpen) {
            ctx.fillStyle = '#d97706';
            ctx.fillRect(p.x, p.y, PLATFORM_WIDTH, PLATFORM_HEIGHT);
            ctx.strokeStyle = '#b45309';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(p.x, p.y, PLATFORM_WIDTH, PLATFORM_HEIGHT);

            ctx.strokeStyle = '#fef3c7';
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(p.x + 6, p.y + 2, PLATFORM_WIDTH - 12, PLATFORM_HEIGHT - 4);
            ctx.setLineDash([]);
          } else {
            // Opened Trapdoor Flaps
            ctx.save();
            ctx.fillStyle = '#b45309';

            // Left Flap
            ctx.translate(p.x, p.y);
            ctx.rotate(p.trapAngle);
            ctx.fillRect(0, 0, PLATFORM_WIDTH / 2, PLATFORM_HEIGHT);
            ctx.restore();

            // Right Flap
            ctx.save();
            ctx.translate(p.x + PLATFORM_WIDTH, p.y);
            ctx.rotate(-p.trapAngle);
            ctx.fillRect(-PLATFORM_WIDTH / 2, 0, PLATFORM_WIDTH / 2, PLATFORM_HEIGHT);
            ctx.restore();
          }
        }

        ctx.restore();
      });

      // Render Player Character (Green Excel Active Cell)
      ctx.save();
      const px = player.x;
      const py = player.y;

      // Active Cell Box Character Style
      ctx.fillStyle = '#107c41';
      ctx.fillRect(px, py, PLAYER_SIZE, PLAYER_SIZE);

      // Selection Ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, PLAYER_SIZE - 2, PLAYER_SIZE - 2);

      // Eyes
      ctx.fillStyle = '#ffffff';
      const eyeOffset = player.facing === 'right' ? 14 : 4;
      ctx.fillRect(px + eyeOffset, py + 6, 4, 6);
      ctx.fillRect(px + eyeOffset + (player.facing === 'right' ? -7 : 7), py + 6, 4, 6);

      // Mouth
      ctx.fillRect(px + 6, py + 16, 12, 2);

      ctx.restore();
    };

    const loop = (timestamp) => {
      const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      update(dt);
      render();

      if (gameState === 'PLAYING') {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState]);

  // Handlers
  const startGame = () => {
    setScore(0);
    setHp(1);
    setGameState('PLAYING');
  };

  const togglePause = () => {
    setGameState((prev) => (prev === 'PLAYING' ? 'PAUSED' : 'PLAYING'));
  };

  return (
    <div className="game-page">
      <button
        aria-controls="game-radio-menu"
        aria-expanded={isRadioMenuOpen}
        aria-label={isRadioMenuOpen ? 'Close radio controls' : 'Open radio controls'}
        className="game-radio-toggle"
        onClick={() => setIsRadioMenuOpen((isOpen) => !isOpen)}
        type="button"
      >
        <span aria-hidden="true">{isRadioMenuOpen ? '×' : '☰'}</span>
      </button>
      {isRadioMenuOpen && (
        <aside className="game-radio-menu" id="game-radio-menu" aria-label="Radio controls">
          <div className="game-radio-heading">
            <strong>扮公 Radio</strong>
            <span className={radioPlaying ? 'is-live' : ''}>{radioLoading ? 'TUNING' : radioPlaying ? 'LIVE' : 'OFF'}</span>
          </div>
          <button
            className="game-radio-power"
            disabled={radioLoading || !selectedChannel}
            onClick={onToggleRadio}
            type="button"
          >
            {radioLoading ? 'Connecting…' : radioPlaying ? 'Turn radio off' : 'Turn radio on'}
          </button>
          <div className="game-radio-channels" aria-label="Radio channels">
            {channels.map((channel) => (
              <button
                aria-pressed={channel.id === selectedChannel}
                className={channel.id === selectedChannel ? 'is-selected' : ''}
                disabled={radioLoading}
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                type="button"
              >
                <strong>{channel.name}</strong>
                <small>{channel.band}{channel.frequency ? ` · ${channel.frequency}` : ''}</small>
              </button>
            ))}
            {channels.length === 0 && <p>Loading channels…</p>}
          </div>
          {radioError && <p className="game-radio-error" role="alert">{radioError}</p>}
        </aside>
      )}

      {/* Main Excel Application Window */}
      <div className="workbook">
        
        {/* Title Bar */}
        <div className="workbook-titlebar">
          <div className="workbook-brand-group">
            <div className="workbook-brand-mark">
              X
            </div>
            <span className="workbook-title">
              辦公_Workbook.xlsx - Excel
            </span>
          </div>

          <div className="workbook-actions">
            {gameState === 'PLAYING' || gameState === 'PAUSED' ? (
              <button
                onClick={togglePause}
                className="workbook-icon-button"
                title="Pause / Resume"
              >
                <span aria-hidden="true">{gameState === 'PLAYING' ? 'Ⅱ' : '▶'}</span>
              </button>
            ) : null}
            <button
              onClick={startGame}
              className="workbook-icon-button"
              title="Restart Sheet"
            >
              <span aria-hidden="true">↻</span>
            </button>
          </div>
        </div>

        {/* Excel Ribbon Tabs Header */}
        <div className="workbook-ribbon">
          {['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`workbook-ribbon-tab${activeTab === tab ? ' is-active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Excel Formula Bar */}
        <div className="formula-bar">
          <span className="formula-reference">
            B2
          </span>
          <span className="formula-fx">fx</span>
          <div className="formula-expression">
            =IF(HIT_SPIKE, "GAME OVER", "DEPTH: " & {score} & "m")
          </div>
        </div>

        {/* Column Headers (A, B, C, D, E) */}
        <div className="spreadsheet-columns">
          <div className="spreadsheet-corner"></div>
          <div className="spreadsheet-column">A</div>
          <div className="spreadsheet-column spreadsheet-column-active">B</div>
          <div className="spreadsheet-column">C</div>
          <div className="spreadsheet-column">D</div>
          <div className="spreadsheet-column">E</div>
        </div>

        {/* Game Stage Area */}
        <div className="spreadsheet-stage">
          {/* Row Headers */}
          <div className="spreadsheet-rows">
            {Array.from({ length: 22 }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Embedded Game Canvas Window */}
          <div className="game-canvas-area">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="game-canvas"
            />

            {/* Dedicated On-Screen Direction Control Buttons */}
            <div className="game-controls">
              <button
                onPointerDown={(e) => { e.preventDefault(); touchLeftRef.current = true; }}
                onPointerUp={(e) => { e.preventDefault(); touchLeftRef.current = false; }}
                onPointerCancel={(e) => { e.preventDefault(); touchLeftRef.current = false; }}
                onPointerLeave={(e) => { e.preventDefault(); touchLeftRef.current = false; }}
                className="game-direction-button"
              >
                <span aria-hidden="true">←</span>
                <span>MOVE LEFT</span>
              </button>

              <button
                onPointerDown={(e) => { e.preventDefault(); touchRightRef.current = true; }}
                onPointerUp={(e) => { e.preventDefault(); touchRightRef.current = false; }}
                onPointerCancel={(e) => { e.preventDefault(); touchRightRef.current = false; }}
                onPointerLeave={(e) => { e.preventDefault(); touchRightRef.current = false; }}
                className="game-direction-button"
              >
                <span>MOVE RIGHT</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>

            {/* Modal Overlays for Start / Pause / Game Over */}
            {gameState !== 'PLAYING' && (
              <div className="game-overlay">
                <div className="game-dialog">
                  {gameState === 'IDLE' && (
                    <>
                      <div className="game-dialog-title">
                        <span aria-hidden="true">▥</span> Micros Excel
                      </div>
                      <p className="game-dialog-copy">
                        Slippery Instant-Kill Mode with On-Screen Controls!
                      </p>
                      <div className="game-rules">
                        <div className="game-rule-danger">• SPIKES = INSTANT GAME OVER!</div>
                        <div>• <b>Controls:</b> Tap/Hold On-Screen Buttons or Keyboard (A/D / Arrows)</div>
                        <div>• <b>Slide/Conveyor:</b> Super slippery momentum physics</div>
                      </div>
                      <button
                        onClick={startGame}
                        className="game-action-button"
                      >
                        Start Game (Space)
                      </button>
                    </>
                  )}

                  {gameState === 'PAUSED' && (
                    <>
                      <div className="game-dialog-heading">Workbook Paused</div>
                      <button
                        onClick={togglePause}
                        className="game-action-button game-action-button-spaced"
                      >
                        Resume Game
                      </button>
                      <button
                        onClick={startGame}
                        className="game-action-button game-action-button-secondary"
                      >
                        Restart
                      </button>
                    </>
                  )}

                  {gameState === 'GAMEOVER' && (
                    <>
                      <div className="game-over-title">Game Over!</div>
                      <p className="game-over-copy">Hit Spikes or Fell off Shaft</p>
                      <div className="game-results">
                        <div className="game-result-row">
                          <span>Depth Reached:</span>
                          <span className="game-result-value">{score} B</span>
                        </div>
                        <div className="game-result-row">
                          <span>Best Highscore:</span>
                          <span className="game-result-value game-result-value-highlight">{highScore} B</span>
                        </div>
                      </div>
                      <button
                        onClick={startGame}
                        className="game-action-button game-action-button-inline"
                      >
                        <span aria-hidden="true">↻</span> Play Again
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Status HUD Bar */}
        <div className="workbook-hud">
          {/* Mode Indicator */}
          <div className="hud-mode">
            <span aria-hidden="true">♥</span>
            <span>INSTANT KILL MODE</span>
          </div>

          {/* Current Depth */}
          <div className="hud-score">
            <span>FLOOR:</span>
            <span className="hud-score-value">{score} B</span>
          </div>

          {/* High Score */}
          <div className="hud-record">
            <span className="hud-record-star" aria-hidden="true">★</span>
            <span>RECORD: {highScore} B</span>
          </div>
        </div>

        {/* Excel Sheet Tabs Footer */}
        <div className="workbook-sheetbar">
          <div className="workbook-sheets">
            {['NS-Shaft.xlsx', 'Sheet2', 'Sheet3'].map((sheet) => (
              <button
                key={sheet}
                onClick={() => setActiveSheet(sheet)}
                className={`workbook-sheet-tab${activeSheet === sheet ? ' is-active' : ''}`}
              >
                {sheet}
              </button>
            ))}
            <button className="workbook-add-sheet" aria-label="Add sheet">
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <div className="workbook-zoom">
            <span>100%</span>
            <div className="workbook-zoom-track">
              <div className="workbook-zoom-fill" />
            </div>
          </div>
        </div>

        {/* Excel Bottom Status Bar */}
        <div className="workbook-statusbar">
          <span>READY</span>
          <span>CALCULATE: AUTOMATIC</span>
        </div>

      </div>
    </div>
  );
}

export default nsShaft;