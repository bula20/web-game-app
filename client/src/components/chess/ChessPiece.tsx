import type { ReactNode } from 'react';
// Chess piece SVG components — Cburnett-style classic chess pieces
// Each piece has viewBox="0 0 45 45", scaled to the given size.

interface ChessPieceProps {
  piece: string; // 'P','N','B','R','Q','K','p','n','b','r','q','k'
  size: number;
}

export function ChessPiece({ piece, size }: ChessPieceProps) {
  const svg = PIECE_SVGS[piece];
  if (!svg) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45 45"
      width={size}
      height={size}
      style={{ pointerEvents: 'none' }}
    >
      {svg}
    </svg>
  );
}

// Stroke and fill styles
const wFill = '#fff';
const wStroke = '#000';
const bFill = '#000';
const bStroke = '#000';
const sw = 1.5; // strokeWidth

const PIECE_SVGS: Record<string, ReactNode> = {
  // ======= WHITE PIECES =======

  'K': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {/* Cross */}
      <path d="M 22.5,11.63 V 6" strokeWidth={sw} />
      <path d="M 20,8 h 5" strokeWidth={sw} />
      {/* Body */}
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" />
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none" />
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none" />
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none" />
    </g>
  ),

  'Q': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {/* Crown circles */}
      <circle cx="6" cy="12" r="2.75" />
      <circle cx="14" cy="9" r="2.75" />
      <circle cx="22.5" cy="8" r="2.75" />
      <circle cx="31" cy="9" r="2.75" />
      <circle cx="39" cy="12" r="2.75" />
      {/* Body */}
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 Z" />
      <path d="M 9,26 C 9,28 10.5,28.5 12.5,30 C 14.5,31.5 16.5,31 16.5,31 C 18.5,30 19.5,30 22.5,30 C 25.5,30 26.5,30 28.5,31 C 28.5,31 30.5,31.5 32.5,30 C 34.5,28.5 36,28 36,26" fill="none" />
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 27,31 22.5,31 C 18,31 12.5,30 12.5,30 L 12.5,37" />
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none" />
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none" />
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none" />
    </g>
  ),

  'R': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 Z" />
      <path d="M 12.5,32 L 14,29.5 L 31,29.5 L 32.5,32 L 12.5,32 Z" />
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 Z" />
      <path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 Z" />
      <path d="M 14,16.5 L 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 31,16.5 L 14,16.5 Z" />
    </g>
  ),

  'B': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 9,36 C 12.4,35.7 19.5,34 22.5,33.5 C 25.5,34 32.6,35.7 36,36 C 36,36 31.5,38.5 22.5,38.5 C 13.5,38.5 9,36 9,36 Z" />
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 Z" />
      <circle cx="22.5" cy="8" r="2.5" />
      <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" />
    </g>
  ),

  'N': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
      <path d="M 24,18 C 24.4,20.9 18.5,19.4 16,20 C 13,20.5 13,21.5 12,23.5 C 11,25.5 10.7,25.5 9,25 C 7.3,24.5 5.5,23.5 6.5,22 C 8.5,19 11.5,14.5 15,12 L 22,10" />
      <circle cx="12" cy="25.5" r="0.5" fill={bFill} stroke="none" />
      <path d="M 17,15.5 C 17,15.5 17.3,13 15.5,12 C 14,11 13,12.5 13,12.5" fill="none" />
    </g>
  ),

  'P': (
    <g fill={wFill} stroke={wStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 22.5,9 C 20.3,9 18.5,10.8 18.5,13 C 18.5,13.9 18.8,14.7 19.2,15.4 C 16.4,16.8 14.5,19.5 14.5,23 C 14.5,26.5 16.4,29.2 19.2,30.6 C 17.4,31.4 9,34 9,39 L 36,39 C 36,34 27.6,31.4 25.8,30.6 C 28.6,29.2 30.5,26.5 30.5,23 C 30.5,19.5 28.6,16.8 25.8,15.4 C 26.2,14.7 26.5,13.9 26.5,13 C 26.5,10.8 24.7,9 22.5,9 Z" />
    </g>
  ),

  // ======= BLACK PIECES =======

  'k': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 22.5,11.63 V 6" stroke={wFill} />
      <path d="M 20,8 h 5" stroke={wFill} />
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" />
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none" stroke={wFill} />
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none" stroke={wFill} />
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none" stroke={wFill} />
    </g>
  ),

  'q': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="2.75" stroke="none" />
      <circle cx="14" cy="9" r="2.75" stroke="none" />
      <circle cx="22.5" cy="8" r="2.75" stroke="none" />
      <circle cx="31" cy="9" r="2.75" stroke="none" />
      <circle cx="39" cy="12" r="2.75" stroke="none" />
      <circle cx="6" cy="12" r="2.75" fill="none" stroke={bStroke} />
      <circle cx="14" cy="9" r="2.75" fill="none" stroke={bStroke} />
      <circle cx="22.5" cy="8" r="2.75" fill="none" stroke={bStroke} />
      <circle cx="31" cy="9" r="2.75" fill="none" stroke={bStroke} />
      <circle cx="39" cy="12" r="2.75" fill="none" stroke={bStroke} />
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 Z" />
      <path d="M 9,26 C 9,28 10.5,28.5 12.5,30 C 14.5,31.5 16.5,31 16.5,31 C 18.5,30 19.5,30 22.5,30 C 25.5,30 26.5,30 28.5,31 C 28.5,31 30.5,31.5 32.5,30 C 34.5,28.5 36,28 36,26" fill="none" />
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 27,31 22.5,31 C 18,31 12.5,30 12.5,30 L 12.5,37" />
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none" stroke={wFill} />
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none" stroke={wFill} />
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none" stroke={wFill} />
    </g>
  ),

  'r': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 Z" />
      <path d="M 12.5,32 L 14,29.5 L 31,29.5 L 32.5,32 L 12.5,32 Z" />
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 Z" />
      <path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 Z" />
      <path d="M 14,16.5 L 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 31,16.5 L 14,16.5 Z" />
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 Z" fill="none" stroke={wFill} />
      <path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 Z" fill="none" stroke={wFill} />
      <path d="M 14,16.5 L 11,14 L 34,14 L 31,16.5 Z" fill="none" stroke={wFill} />
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" fill="none" stroke={wFill} />
    </g>
  ),

  'b': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 9,36 C 12.4,35.7 19.5,34 22.5,33.5 C 25.5,34 32.6,35.7 36,36 C 36,36 31.5,38.5 22.5,38.5 C 13.5,38.5 9,36 9,36 Z" />
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 Z" />
      <circle cx="22.5" cy="8" r="2.5" />
      <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30" fill="none" stroke={wFill} />
      <path d="M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" stroke={wFill} />
    </g>
  ),

  'n': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
      <path d="M 24,18 C 24.4,20.9 18.5,19.4 16,20 C 13,20.5 13,21.5 12,23.5 C 11,25.5 10.7,25.5 9,25 C 7.3,24.5 5.5,23.5 6.5,22 C 8.5,19 11.5,14.5 15,12 L 22,10" />
      <circle cx="12" cy="25.5" r="0.5" fill={wFill} stroke="none" />
      <path d="M 17,15.5 C 17,15.5 17.3,13 15.5,12 C 14,11 13,12.5 13,12.5" fill="none" stroke={wFill} />
    </g>
  ),

  'p': (
    <g fill={bFill} stroke={bStroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 22.5,9 C 20.3,9 18.5,10.8 18.5,13 C 18.5,13.9 18.8,14.7 19.2,15.4 C 16.4,16.8 14.5,19.5 14.5,23 C 14.5,26.5 16.4,29.2 19.2,30.6 C 17.4,31.4 9,34 9,39 L 36,39 C 36,34 27.6,31.4 25.8,30.6 C 28.6,29.2 30.5,26.5 30.5,23 C 30.5,19.5 28.6,16.8 25.8,15.4 C 26.2,14.7 26.5,13.9 26.5,13 C 26.5,10.8 24.7,9 22.5,9 Z" />
    </g>
  ),
};
