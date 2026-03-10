/**
 * API News - Actualités sportives via z-ai SDK
 * 
 * GET: /api/news?sport=basket&team=Lakers
 * POST: /api/news (body: { sport, homeTeam, awayTeam })
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchNBATeamNews, searchNBAMatchupNews } from '@/lib/nbaWebSearch';
import { searchFootballTeamNews, searchFootballMatchupNews } from '@/lib/footballWebSearch';
import { getMatchInjuries } from '@/lib/injuryScraper';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'football';
  const team = searchParams.get('team');
  const homeTeam = searchParams.get('homeTeam');
  const awayTeam = searchParams.get('awayTeam');
  const league = searchParams.get('league') || undefined;

  try {
    // Mode matchup (deux équipes)
    if (homeTeam && awayTeam) {
      if (sport === 'basket') {
        const [news, injuries] = await Promise.all([
          searchNBAMatchupNews(homeTeam, awayTeam),
          getMatchInjuries(homeTeam, awayTeam, 'basketball'),
        ]);

        return NextResponse.json({
          success: true,
          sport: 'NBA',
          matchup: {
            homeTeam,
            awayTeam,
            homeNews: news.homeNews,
            awayNews: news.awayNews,
            matchupAnalysis: news.matchupAnalysis,
          },
          injuries: {
            home: injuries.homeInjuries,
            away: injuries.awayInjuries,
            impactLevel: injuries.impactLevel,
          },
        });
      } else {
        const [news, injuries] = await Promise.all([
          searchFootballMatchupNews(homeTeam, awayTeam, league),
          getMatchInjuries(homeTeam, awayTeam, 'football'),
        ]);

        return NextResponse.json({
          success: true,
          sport: 'Football',
          matchup: {
            homeTeam,
            awayTeam,
            homeNews: news.homeNews,
            awayNews: news.awayNews,
            matchupAnalysis: news.matchupAnalysis,
            predictedLineups: news.predictedLineups,
          },
          injuries: {
            home: injuries.homeInjuries,
            away: injuries.awayInjuries,
            impactLevel: injuries.impactLevel,
          },
        });
      }
    }

    // Mode équipe unique
    if (team) {
      if (sport === 'basket') {
        const teamNews = await searchNBATeamNews(team);
        return NextResponse.json({
          success: true,
          sport: 'NBA',
          team,
          news: teamNews.news,
          injuries: teamNews.injuries,
        });
      } else {
        const teamNews = await searchFootballTeamNews(team);
        return NextResponse.json({
          success: true,
          sport: 'Football',
          team,
          news: teamNews.news,
          injuries: teamNews.injuries,
        });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Paramètres requis: team ou (homeTeam + awayTeam)',
    }, { status: 400 });

  } catch (error) {
    console.error('❌ Erreur API news:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sport, homeTeam, awayTeam, league } = body;

    if (!homeTeam || !awayTeam) {
      return NextResponse.json({
        success: false,
        error: 'homeTeam et awayTeam requis',
      }, { status: 400 });
    }

    const isNBA = sport === 'basket' || sport === 'nba' || sport === 'basketball';

    if (isNBA) {
      const [news, injuries] = await Promise.all([
        searchNBAMatchupNews(homeTeam, awayTeam),
        getMatchInjuries(homeTeam, awayTeam, 'basketball'),
      ]);

      return NextResponse.json({
        success: true,
        sport: 'NBA',
        matchup: {
          homeTeam,
          awayTeam,
          homeNews: news.homeNews,
          awayNews: news.awayNews,
          matchupAnalysis: news.matchupAnalysis,
        },
        injuries: {
          home: injuries.homeInjuries,
          away: injuries.awayInjuries,
          impactLevel: injuries.impactLevel,
        },
      });
    } else {
      const [news, injuries] = await Promise.all([
        searchFootballMatchupNews(homeTeam, awayTeam, league),
        getMatchInjuries(homeTeam, awayTeam, 'football'),
      ]);

      return NextResponse.json({
        success: true,
        sport: 'Football',
        matchup: {
          homeTeam,
          awayTeam,
          homeNews: news.homeNews,
          awayNews: news.awayNews,
          matchupAnalysis: news.matchupAnalysis,
          predictedLineups: news.predictedLineups,
        },
        injuries: {
          home: injuries.homeInjuries,
          away: injuries.awayInjuries,
          impactLevel: injuries.impactLevel,
        },
      });
    }

  } catch (error) {
    console.error('❌ Erreur API news POST:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }, { status: 500 });
  }
}
