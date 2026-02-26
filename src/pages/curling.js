import React, { useEffect, useRef, useState, useCallback } from 'react';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 700;
const STONE_RADIUS = 18;
const FRICTION = 0.988;
const MAX_POWER = 18;
const CURL_STRENGTH = 0.026; // lateral drift per frame

const HOUSE_X = CANVAS_WIDTH / 2;
const HOUSE_Y = 160;
const DELIVERY_Y = CANVAS_HEIGHT - 80;

const COLORS = {
    red: '#e53e3e',
    yellow: '#ecc94b',
    ice: '#cfe8f9',
    iceSheen: '#e8f4fd',
    line: '#a0c8e8',
    hog: '#3182ce',
    button: '#e53e3e',
    ring4ft: '#ecc94b',
    ring8ft: '#fc8181',
    ring12ft: '#e53e3e',
    house: '#fff',
    text: '#1a202c',
};

function drawIce(ctx) {
    ctx.fillStyle = COLORS.ice;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.iceSheen;
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) ctx.fillRect(0, y, CANVAS_WIDTH, 18);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 20);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.hog;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, DELIVERY_Y - 60);
    ctx.lineTo(CANVAS_WIDTH - 20, DELIVERY_Y - 60);
    ctx.stroke();
    ctx.fillStyle = COLORS.hog;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('HOG LINE', CANVAS_WIDTH - 95, DELIVERY_Y - 65);
}

function drawHouse(ctx) {
    const rings = [
        { r: 72, color: COLORS.ring12ft },
        { r: 48, color: COLORS.ring8ft },
        { r: 24, color: COLORS.ring4ft },
        { r: 8, color: COLORS.button },
    ];
    for (const ring of rings) {
        ctx.beginPath();
        ctx.arc(HOUSE_X, HOUSE_Y, ring.r, 0, Math.PI * 2);
        ctx.fillStyle = ring.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(HOUSE_X - 72, HOUSE_Y);
    ctx.lineTo(HOUSE_X + 72, HOUSE_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(HOUSE_X, HOUSE_Y - 72);
    ctx.lineTo(HOUSE_X, HOUSE_Y + 72);
    ctx.stroke();
}

function drawStone(ctx, stone, isPlayer) {
    ctx.beginPath();
    ctx.arc(stone.x + 3, stone.y + 3, STONE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(stone.x, stone.y, STONE_RADIUS, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(stone.x - 5, stone.y - 5, 2, stone.x, stone.y, STONE_RADIUS);
    grad.addColorStop(0, isPlayer ? '#fc8181' : '#fbd38d');
    grad.addColorStop(1, isPlayer ? '#c53030' : '#c05621');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = isPlayer ? '#742a2a' : '#7b341e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stone.x, stone.y, STONE_RADIUS * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = isPlayer ? '#742a2a' : '#7b341e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(stone.x, stone.y, STONE_RADIUS * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = isPlayer ? '#fc8181' : '#fbd38d';
    ctx.fill();
}

function drawAimLine(ctx, fromX, fromY, toX, toY) {
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 12 * Math.cos(angle - 0.4), toY - 12 * Math.sin(angle - 0.4));
    ctx.lineTo(toX - 12 * Math.cos(angle + 0.4), toY - 12 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
}

function distanceBetween(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function scoreStones(playerStones, cpuStones) {
    const all = [
        ...playerStones.map(s => ({ ...s, team: 'player' })),
        ...cpuStones.map(s => ({ ...s, team: 'cpu' })),
    ].map(s => ({ ...s, dist: distanceBetween(s, { x: HOUSE_X, y: HOUSE_Y }) }));
    all.sort((a, b) => a.dist - b.dist);
    const scored = { player: 0, cpu: 0 };
    if (!all.length) return scored;
    const closest = all[0].team;
    for (const s of all) {
        if (s.team !== closest) break;
        if (s.dist < 72 + STONE_RADIUS) scored[closest]++;
    }
    return scored;
}

function resolveCollision(mover, vel, placed) {
    const dx = placed.x - mover.x;
    const dy = placed.y - mover.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= STONE_RADIUS * 2 || dist === 0) return null;
    const nx = dx / dist;
    const ny = dy / dist;
    const dot = vel.vx * nx + vel.vy * ny;
    if (dot <= 0) return null;
    vel.vx -= dot * nx;
    vel.vy -= dot * ny;
    const overlap = STONE_RADIUS * 2 - dist;
    mover.x -= overlap * nx * 0.5;
    mover.y -= overlap * ny * 0.5;
    return { x: placed.x + overlap * nx * 0.5, y: placed.y + overlap * ny * 0.5, vx: dot * nx, vy: dot * ny };
}

function checkCollisionsWithPlaced(playerStones, cpuStones, movingStones, mover, vel) {
    for (let i = playerStones.length - 1; i >= 0; i--) {
        const result = resolveCollision(mover, vel, playerStones[i]);
        if (result) { movingStones.push({ ...result, isPlayer: true }); playerStones.splice(i, 1); }
    }
    for (let i = cpuStones.length - 1; i >= 0; i--) {
        const result = resolveCollision(mover, vel, cpuStones[i]);
        if (result) { movingStones.push({ ...result, isPlayer: false }); cpuStones.splice(i, 1); }
    }
}

function isOutOfBounds(stone) {
    return stone.x < 20 || stone.x > CANVAS_WIDTH - 20 || stone.y < 20 || stone.y > CANVAS_HEIGHT - 20;
}

// Apply curl: small lateral drift perpendicular to velocity
function applyCurl(vel, curl) {
    const spd = Math.sqrt(vel.vx ** 2 + vel.vy ** 2);
    if (spd < 0.4 || curl === 0) return;
    const perpX = -vel.vy / spd;
    const perpY = vel.vx / spd;
    vel.vx += curl * CURL_STRENGTH * perpX;
    vel.vy += curl * CURL_STRENGTH * perpY;
}

const TOTAL_ENDS = 3;
const STONES_PER_SIDE = 4;

function makeInitialState() {
    const playerGoesFirst = Math.random() < 0.5;
    return {
        phase: 'start', // start | aim | power | sliding | cpu | endOver | gameOver
        playerStones: [],
        cpuStones: [],
        movingStones: [],
        activeStone: { x: CANVAS_WIDTH / 2, y: DELIVERY_Y },
        activeStoneSettled: false,
        velocity: { vx: 0, vy: 0 },
        aimAngle: -Math.PI / 2,
        power: 0,
        powerDir: 1,
        curl: 0,             // -1 = left curve, 0 = straight, 1 = right curve
        playerGoesFirst,
        nextThrowMsg: playerGoesFirst ? 'You throw first!' : 'CPU throws first!',
        stonesThrown: 0,
        currentEnd: 1,
        playerScore: 0,
        cpuScore: 0,
        endScores: [],
        animFrame: null,
    };
}

export default function CurlingGame() {
    const canvasRef = useRef(null);
    const stateRef = useRef(makeInitialState());

    const [displayState, setDisplayState] = useState(() => {
        const s = stateRef.current;
        return {
            phase: s.phase,
            playerScore: 0,
            cpuScore: 0,
            currentEnd: 1,
            power: 0,
            curl: 0,
            stonesThrown: 0,
            endScores: [],
            playerGoesFirst: s.playerGoesFirst,
            nextThrowMsg: s.nextThrowMsg,
        };
    });

    const syncDisplay = useCallback(() => {
        const s = stateRef.current;
        setDisplayState({
            phase: s.phase,
            playerScore: s.playerScore,
            cpuScore: s.cpuScore,
            currentEnd: s.currentEnd,
            power: s.power,
            curl: s.curl,
            stonesThrown: s.stonesThrown,
            endScores: [...s.endScores],
            playerGoesFirst: s.playerGoesFirst,
            nextThrowMsg: s.nextThrowMsg,
        });
    }, []);

    const isPlayerTurnNow = (st) =>
        st.playerGoesFirst ? st.stonesThrown % 2 === 0 : st.stonesThrown % 2 !== 0;

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const s = stateRef.current;

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawIce(ctx);
        drawHouse(ctx);

        s.playerStones.forEach(st => drawStone(ctx, st, true));
        s.cpuStones.forEach(st => drawStone(ctx, st, false));
        s.movingStones.forEach(ms => drawStone(ctx, ms, ms.isPlayer));

        const isPlayerStone = isPlayerTurnNow(s);

        if (s.phase === 'aim') {
            const aimLen = 120;
            drawAimLine(
                ctx,
                s.activeStone.x, s.activeStone.y,
                s.activeStone.x + aimLen * Math.cos(s.aimAngle),
                s.activeStone.y + aimLen * Math.sin(s.aimAngle)
            );
            drawStone(ctx, s.activeStone, isPlayerStone);

            // Curl indicator above stone
            if (s.curl !== 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(s.curl < 0 ? '↺' : '↻', s.activeStone.x, s.activeStone.y - STONE_RADIUS - 8);
                ctx.textAlign = 'left';
            }
        } else if (s.phase === 'power') {
            drawStone(ctx, s.activeStone, isPlayerStone);

            // Curl indicator
            if (s.curl !== 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(s.curl < 0 ? '↺' : '↻', s.activeStone.x, s.activeStone.y - STONE_RADIUS - 8);
                ctx.textAlign = 'left';
            }

            // Power bar on canvas
            const barW = 200, barH = 18;
            const barX = CANVAS_WIDTH / 2 - barW / 2;
            const barY = DELIVERY_Y - 60;
            ctx.fillStyle = 'rgba(0,0,20,0.75)';
            ctx.fillRect(barX - 12, barY - 26, barW + 24, barH + 44);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('POWER — release to throw!', CANVAS_WIDTH / 2, barY - 8);
            ctx.fillStyle = '#2d3748';
            ctx.fillRect(barX, barY, barW, barH);
            const fillW = (s.power / 100) * barW;
            ctx.fillStyle = `hsl(${120 - s.power * 1.2}, 80%, 45%)`;
            ctx.fillRect(barX, barY, fillW, barH);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);
            ctx.textAlign = 'left';
        } else if ((s.phase === 'sliding' || s.phase === 'cpu') && !s.activeStoneSettled) {
            drawStone(ctx, s.activeStone, s.phase === 'sliding');
        }

        if (s.phase === 'endOver' || s.phase === 'gameOver' || s.phase === 'start') {
            ctx.fillStyle = 'rgba(0,0,30,0.55)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
    }, []);

    const startNextThrow = useCallback(() => {
        const s = stateRef.current;
        s.activeStone = { x: CANVAS_WIDTH / 2, y: DELIVERY_Y };
        s.velocity = { vx: 0, vy: 0 };
        s.aimAngle = -Math.PI / 2;
        s.power = 0;
        s.powerDir = 1;
        s.curl = 0;
        s.movingStones = [];
        s.activeStoneSettled = false;
        s.phase = 'aim';
        syncDisplay();
        render();
    }, [render, syncDisplay]);

    const finishEnd = useCallback(() => {
        const s = stateRef.current;
        const ended = scoreStones(s.playerStones, s.cpuStones);
        s.playerScore += ended.player;
        s.cpuScore += ended.cpu;
        s.endScores.push({ end: s.currentEnd, player: ended.player, cpu: ended.cpu });

        if (s.currentEnd >= TOTAL_ENDS) {
            s.phase = 'gameOver';
        } else {
            s.currentEnd++;
            s.stonesThrown = 0;
            s.playerStones = [];
            s.cpuStones = [];

            // The team that didn't score gets the hammer (throws last = advantage)
            // So the scoring team throws FIRST next end
            if (ended.player > 0 && ended.cpu === 0) {
                s.playerGoesFirst = true;
                s.nextThrowMsg = 'You throw first (you scored)';
            } else if (ended.cpu > 0 && ended.player === 0) {
                s.playerGoesFirst = false;
                s.nextThrowMsg = 'CPU throws first (CPU scored)';
            } else {
                s.playerGoesFirst = Math.random() < 0.5;
                s.nextThrowMsg = s.playerGoesFirst ? 'You throw first (coin flip)' : 'CPU throws first (coin flip)';
            }
            s.phase = 'endOver';
        }
        syncDisplay();
        render();
    }, [render, syncDisplay]);

    const doCpuThrow = useCallback(() => {
        const s = stateRef.current;
        s.phase = 'cpu';
        s.movingStones = [];
        s.activeStoneSettled = false;

        // CPU picks a random curl
        s.curl = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];

        const jitter = (Math.random() - 0.5) * 60;
        const targetX = HOUSE_X + jitter;
        const targetY = HOUSE_Y + (Math.random() - 0.5) * 40;
        const dx = targetX - CANVAS_WIDTH / 2;
        const dy = targetY - DELIVERY_Y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 9 + Math.random() * 4;

        s.activeStone = { x: CANVAS_WIDTH / 2, y: DELIVERY_Y };
        s.velocity = { vx: (dx / dist) * speed, vy: (dy / dist) * speed };

        syncDisplay();

        function slide() {
            const st = stateRef.current;

            if (!st.activeStoneSettled) {
                applyCurl(st.velocity, st.curl);
                st.activeStone.x += st.velocity.vx;
                st.activeStone.y += st.velocity.vy;
                st.velocity.vx *= FRICTION;
                st.velocity.vy *= FRICTION;
                checkCollisionsWithPlaced(st.playerStones, st.cpuStones, st.movingStones, st.activeStone, st.velocity);
                const spd = Math.sqrt(st.velocity.vx ** 2 + st.velocity.vy ** 2);
                if (spd < 0.3 || isOutOfBounds(st.activeStone)) {
                    if (!isOutOfBounds(st.activeStone)) st.cpuStones.push({ x: st.activeStone.x, y: st.activeStone.y });
                    st.activeStoneSettled = true;
                }
            }

            const msCount = st.movingStones.length;
            for (let j = 0; j < msCount; j++) {
                const ms = st.movingStones[j];
                ms.x += ms.vx; ms.y += ms.vy; ms.vx *= FRICTION; ms.vy *= FRICTION;
                checkCollisionsWithPlaced(st.playerStones, st.cpuStones, st.movingStones, ms, ms);
            }
            for (let i = st.movingStones.length - 1; i >= 0; i--) {
                const ms = st.movingStones[i];
                const msSpd = Math.sqrt(ms.vx ** 2 + ms.vy ** 2);
                if (msSpd < 0.3 || isOutOfBounds(ms)) {
                    if (!isOutOfBounds(ms)) {
                        if (ms.isPlayer) st.playerStones.push({ x: ms.x, y: ms.y });
                        else st.cpuStones.push({ x: ms.x, y: ms.y });
                    }
                    st.movingStones.splice(i, 1);
                }
            }

            if (st.activeStoneSettled && st.movingStones.length === 0) {
                st.stonesThrown++;
                if (st.stonesThrown >= STONES_PER_SIDE * 2) {
                    finishEnd();
                } else if (isPlayerTurnNow(st)) {
                    startNextThrow();
                } else {
                    setTimeout(() => doCpuThrow(), 400);
                }
                return;
            }
            render();
            st.animFrame = requestAnimationFrame(slide);
        }
        render();
        stateRef.current.animFrame = requestAnimationFrame(slide);
    }, [render, syncDisplay, startNextThrow, finishEnd]);

    const handleMouseMove = useCallback((e) => {
        const s = stateRef.current;
        if (s.phase !== 'aim') return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        s.aimAngle = Math.atan2(
            (e.clientY - rect.top) * scaleY - s.activeStone.y,
            (e.clientX - rect.left) * scaleX - s.activeStone.x
        );
        render();
    }, [render]);

    const handleMouseDown = useCallback(() => {
        const s = stateRef.current;
        if (s.phase !== 'aim' || !isPlayerTurnNow(s)) return;
        s.phase = 'power';
        s.power = 0;
        s.powerDir = 1;
        syncDisplay();

        function animatePower() {
            const st = stateRef.current;
            if (st.phase !== 'power') return;
            st.power += st.powerDir * 0.7;
            if (st.power >= 100) { st.power = 100; st.powerDir = -1; }
            if (st.power <= 0) { st.power = 0; st.powerDir = 1; }
            syncDisplay();
            render();
            st.animFrame = requestAnimationFrame(animatePower);
        }
        stateRef.current.animFrame = requestAnimationFrame(animatePower);
    }, [syncDisplay, render]);

    const handleMouseUp = useCallback(() => {
        const s = stateRef.current;
        if (s.phase !== 'power') return;
        cancelAnimationFrame(s.animFrame);
        const speed = (s.power / 100) * MAX_POWER;
        s.velocity = {
            vx: Math.cos(s.aimAngle) * speed,
            vy: Math.sin(s.aimAngle) * speed,
        };
        s.movingStones = [];
        s.activeStoneSettled = false;
        s.phase = 'sliding';
        syncDisplay();

        function slide() {
            const st = stateRef.current;

            if (!st.activeStoneSettled) {
                applyCurl(st.velocity, st.curl);
                st.activeStone.x += st.velocity.vx;
                st.activeStone.y += st.velocity.vy;
                st.velocity.vx *= FRICTION;
                st.velocity.vy *= FRICTION;
                checkCollisionsWithPlaced(st.playerStones, st.cpuStones, st.movingStones, st.activeStone, st.velocity);
                const spd = Math.sqrt(st.velocity.vx ** 2 + st.velocity.vy ** 2);
                if (spd < 0.3 || isOutOfBounds(st.activeStone)) {
                    if (!isOutOfBounds(st.activeStone)) st.playerStones.push({ x: st.activeStone.x, y: st.activeStone.y });
                    st.activeStoneSettled = true;
                }
            }

            const msCount = st.movingStones.length;
            for (let j = 0; j < msCount; j++) {
                const ms = st.movingStones[j];
                ms.x += ms.vx; ms.y += ms.vy; ms.vx *= FRICTION; ms.vy *= FRICTION;
                checkCollisionsWithPlaced(st.playerStones, st.cpuStones, st.movingStones, ms, ms);
            }
            for (let i = st.movingStones.length - 1; i >= 0; i--) {
                const ms = st.movingStones[i];
                const msSpd = Math.sqrt(ms.vx ** 2 + ms.vy ** 2);
                if (msSpd < 0.3 || isOutOfBounds(ms)) {
                    if (!isOutOfBounds(ms)) {
                        if (ms.isPlayer) st.playerStones.push({ x: ms.x, y: ms.y });
                        else st.cpuStones.push({ x: ms.x, y: ms.y });
                    }
                    st.movingStones.splice(i, 1);
                }
            }

            if (st.activeStoneSettled && st.movingStones.length === 0) {
                st.stonesThrown++;
                if (st.stonesThrown >= STONES_PER_SIDE * 2) {
                    finishEnd();
                } else if (isPlayerTurnNow(st)) {
                    startNextThrow();
                } else {
                    setTimeout(() => doCpuThrow(), 400);
                }
                return;
            }
            render();
            st.animFrame = requestAnimationFrame(slide);
        }
        stateRef.current.animFrame = requestAnimationFrame(slide);
    }, [render, syncDisplay, doCpuThrow, startNextThrow, finishEnd]);

    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseUp]);

    // Start playing (from 'start' or 'endOver' overlays)
    const handleBeginEnd = useCallback(() => {
        const s = stateRef.current;
        if (s.playerGoesFirst) {
            startNextThrow();
        } else {
            // Dismiss overlay, CPU throws after brief delay
            s.phase = 'aim'; // clears the overlay (CPU stone will be drawn as yellow)
            syncDisplay();
            render();
            setTimeout(() => doCpuThrow(), 600);
        }
    }, [startNextThrow, syncDisplay, render, doCpuThrow]);

    const handleSetCurl = useCallback((value) => {
        const s = stateRef.current;
        if (s.phase !== 'aim') return;
        s.curl = value;
        syncDisplay();
        render();
    }, [syncDisplay, render]);

    const handleRestart = useCallback(() => {
        cancelAnimationFrame(stateRef.current.animFrame);
        const fresh = makeInitialState();
        Object.assign(stateRef.current, fresh);
        syncDisplay();
        render();
    }, [render, syncDisplay]);

    useEffect(() => {
        render();
        return () => cancelAnimationFrame(stateRef.current.animFrame);
    }, [render]);

    const phase = displayState.phase;
    const isPlayerTurn = displayState.playerGoesFirst
        ? displayState.stonesThrown % 2 === 0
        : displayState.stonesThrown % 2 !== 0;

    const btnBase = {
        border: 'none', borderRadius: 8, padding: '7px 14px',
        fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1a365d 0%, #2c5282 50%, #1a365d 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            padding: '20px',
        }}>
            <h1 style={{
                color: '#fff', fontSize: '2rem', fontWeight: 800, letterSpacing: '2px',
                marginBottom: '8px', textShadow: '0 2px 8px rgba(0,0,0,0.4)', textTransform: 'uppercase',
            }}>
                🥌 Mini Curling
            </h1>

            {/* Scoreboard */}
            <div style={{
                display: 'flex', gap: '24px', marginBottom: '12px',
                background: 'rgba(255,255,255,0.12)', borderRadius: '12px',
                padding: '10px 24px', color: '#fff', alignItems: 'center',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>You 🔴</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800 }}>{displayState.playerScore}</div>
                </div>
                <div style={{ opacity: 0.5, fontSize: '1.2rem' }}>vs</div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>CPU 🟡</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800 }}>{displayState.cpuScore}</div>
                </div>
                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>End</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{displayState.currentEnd}/{TOTAL_ENDS}</div>
                </div>
            </div>

            {/* Main game row: canvas + rules panel */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

                {/* Canvas + controls */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                    {/* Curl selector — shown during player aim */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 8,
                        visibility: (phase === 'aim' && isPlayerTurn) ? 'visible' : 'hidden',
                    }}>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', alignSelf: 'center' }}>Curl:</span>
                        {[{ v: -1, label: '↺ Left' }, { v: 0, label: '● Straight' }, { v: 1, label: 'Right ↻' }].map(({ v, label }) => (
                            <button
                                key={v}
                                onMouseDown={(e) => { e.preventDefault(); handleSetCurl(v); }}
                                style={{
                                    ...btnBase,
                                    background: displayState.curl === v ? '#e2e8f0' : 'rgba(255,255,255,0.15)',
                                    color: displayState.curl === v ? '#1a202c' : '#fff',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Canvas container */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <canvas
                            ref={canvasRef}
                            width={CANVAS_WIDTH}
                            height={CANVAS_HEIGHT}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            style={{
                                borderRadius: '12px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                cursor: phase === 'aim' ? 'crosshair' : phase === 'power' ? 'pointer' : 'default',
                                display: 'block',
                                maxWidth: '100%',
                                maxHeight: '60vh',
                                userSelect: 'none',
                            }}
                        />

                        {/* Start (coin flip) overlay */}
                        {phase === 'start' && (
                            <div style={{
                                position: 'absolute', inset: 0, display: 'flex',
                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                            }}>
                                <div style={{
                                    background: 'rgba(10,20,60,0.94)', borderRadius: 16,
                                    padding: '32px 40px', color: '#fff', textAlign: 'center',
                                    boxShadow: '0 4px 30px rgba(0,0,0,0.6)',
                                }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🪙</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>Coin Flip!</div>
                                    <div style={{ fontSize: '1rem', marginBottom: 20, opacity: 0.9 }}>
                                        {displayState.nextThrowMsg}
                                    </div>
                                    <button
                                        onClick={handleBeginEnd}
                                        style={{ ...btnBase, background: '#3182ce', color: '#fff', padding: '10px 28px', fontSize: '1rem' }}
                                    >
                                        Let&apos;s Play!
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* End Over overlay */}
                        {phase === 'endOver' && (
                            <div style={{
                                position: 'absolute', inset: 0, display: 'flex',
                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                            }}>
                                <div style={{
                                    background: 'rgba(10,20,60,0.92)', borderRadius: 16,
                                    padding: '32px 40px', color: '#fff', textAlign: 'center',
                                    boxShadow: '0 4px 30px rgba(0,0,0,0.6)',
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
                                        End {displayState.currentEnd - 1} Over!
                                    </div>
                                    {displayState.endScores.length > 0 && (() => {
                                        const last = displayState.endScores[displayState.endScores.length - 1];
                                        return (
                                            <div style={{ marginBottom: 12, fontSize: '0.9rem', opacity: 0.85 }}>
                                                You scored <strong>{last.player}</strong> &nbsp;|&nbsp; CPU scored <strong>{last.cpu}</strong>
                                            </div>
                                        );
                                    })()}
                                    <div style={{ marginBottom: 16, fontSize: '0.85rem', opacity: 0.75 }}>
                                        🪙 Next end: {displayState.nextThrowMsg}
                                    </div>
                                    <button
                                        onClick={handleBeginEnd}
                                        style={{ ...btnBase, background: '#3182ce', color: '#fff', padding: '10px 28px', fontSize: '1rem' }}
                                    >
                                        Next End →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Game Over overlay */}
                        {phase === 'gameOver' && (
                            <div style={{
                                position: 'absolute', inset: 0, display: 'flex',
                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                            }}>
                                <div style={{
                                    background: 'rgba(10,20,60,0.95)', borderRadius: 16,
                                    padding: '32px 40px', color: '#fff', textAlign: 'center',
                                    boxShadow: '0 4px 30px rgba(0,0,0,0.6)', minWidth: 260,
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: 4 }}>
                                        {displayState.playerScore > displayState.cpuScore ? '🏆' : displayState.playerScore < displayState.cpuScore ? '😞' : '🤝'}
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 12 }}>
                                        {displayState.playerScore > displayState.cpuScore ? 'You Win!' : displayState.playerScore < displayState.cpuScore ? 'CPU Wins!' : 'Draw!'}
                                    </div>
                                    <div style={{ marginBottom: 16, fontSize: '1.1rem' }}>
                                        <span style={{ color: '#fc8181' }}>You: {displayState.playerScore}</span>
                                        {' — '}
                                        <span style={{ color: '#fbd38d' }}>CPU: {displayState.cpuScore}</span>
                                    </div>
                                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginBottom: 16 }}>
                                        <thead>
                                            <tr style={{ opacity: 0.6 }}>
                                                <th style={{ padding: '4px 8px' }}>End</th>
                                                <th style={{ padding: '4px 8px', color: '#fc8181' }}>You</th>
                                                <th style={{ padding: '4px 8px', color: '#fbd38d' }}>CPU</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayState.endScores.map((es) => (
                                                <tr key={es.end}>
                                                    <td style={{ padding: '3px 8px', textAlign: 'center' }}>{es.end}</td>
                                                    <td style={{ padding: '3px 8px', textAlign: 'center', color: '#fc8181' }}>{es.player}</td>
                                                    <td style={{ padding: '3px 8px', textAlign: 'center', color: '#fbd38d' }}>{es.cpu}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button
                                        onClick={handleRestart}
                                        style={{ ...btnBase, background: '#38a169', color: '#fff', padding: '10px 28px', fontSize: '1rem' }}
                                    >
                                        Play Again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status line */}
                    <div style={{
                        marginTop: 10, color: 'rgba(255,255,255,0.8)', textAlign: 'center',
                        fontSize: '0.85rem', maxWidth: 480, lineHeight: 1.6,
                    }}>
                        {phase === 'aim' && isPlayerTurn && <span>🎯 Aim with mouse • pick curl above • <strong>hold</strong> to charge</span>}
                        {phase === 'power' && <span>⚡ <strong>Release</strong> to throw!</span>}
                        {phase === 'sliding' && <span>🥌 Stone sliding…</span>}
                        {phase === 'cpu' && <span>🤖 CPU throwing…</span>}
                        {phase === 'aim' && !isPlayerTurn && <span>🤖 CPU&apos;s turn…</span>}
                    </div>
                </div>

                {/* Rules panel */}
                <div style={{
                    width: 190,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    color: '#fff',
                    fontSize: '0.82rem',
                    lineHeight: 1.65,
                    flexShrink: 0,
                }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 10, letterSpacing: 0.5 }}>
                        📖 How to Play
                    </div>

                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#90cdf4' }}>Throwing</div>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 16 }}>
                        <li>Move the mouse to aim</li>
                        <li><strong>Hold</strong> the mouse button to charge power</li>
                        <li><strong>Release</strong> to throw</li>
                    </ul>

                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#90cdf4' }}>Curl</div>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 16 }}>
                        <li>Stones curve as they slow down</li>
                        <li>Pick <em>Left</em>, <em>Straight</em>, or <em>Right</em> curl before throwing</li>
                        <li>The ↺ / ↻ symbol shows active curl</li>
                    </ul>

                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#90cdf4' }}>Scoring</div>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 16 }}>
                        <li>Only the team with the <strong>closest stone</strong> scores</li>
                        <li>They score 1 point per stone closer than any opponent stone</li>
                        <li>Stones must be inside the house (outer ring)</li>
                    </ul>

                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#90cdf4' }}>Hammer</div>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 16 }}>
                        <li>The <strong>scoring team</strong> throws first next end</li>
                        <li>Going last is an advantage — called the <em>hammer</em></li>
                        <li>First end decided by coin flip</li>
                    </ul>

                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#90cdf4' }}>Game</div>
                    <ul style={{ margin: '0', paddingLeft: 16 }}>
                        <li>{STONES_PER_SIDE} stones each per end</li>
                        <li>{TOTAL_ENDS} ends total</li>
                        <li>Highest score wins!</li>
                    </ul>
                </div>
            </div>

            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                🔴 Red = You &nbsp;•&nbsp; 🟡 Yellow = CPU &nbsp;•&nbsp; {STONES_PER_SIDE} stones each &nbsp;•&nbsp; {TOTAL_ENDS} ends
            </div>
        </div>
    );
}
