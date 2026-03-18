/**
 * API Status Endpoint - Vérifie l'état de toutes les APIs
 * 
 * GET /api/status - Retourne l'état complet du système
 */

import { NextResponse } from 'next/server';
import { getSystemStatus, generateStatusHTML } from '@/lib/apiStatus';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';
  
  try {
    const status = await getSystemStatus();
    
    if (format === 'html') {
      return new Response(generateStatusHTML(status), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...status
    });
    
  } catch (error: any) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      overall: 'down',
      error: error.message
    }, { status: 500 });
  }
}
