import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import {
  getUsers, getTeams, getTeamStats, getChannelsForTeam, getChannelStats,
  getSystemPing, getAnalytics, deactivateUser, deleteChannel, createChannel,
  deleteTeam, postToChannelById,
} from '../../../lib/mattermost';

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return unauthorized();

  const resource = url.searchParams.get('resource');

  switch (resource) {
    case 'overview': {
      const [users, teams, ping, analytics] = await Promise.all([
        getUsers(),
        getTeams(),
        getSystemPing(),
        getAnalytics(),
      ]);

      const teamStats = await Promise.all(
        teams.map(async (t) => {
          const stats = await getTeamStats(t.id);
          return { ...t, member_count: stats?.total_member_count ?? 0 };
        })
      );

      const realUsers = users.filter(u => !u.is_bot && u.delete_at === 0);
      const bots = users.filter(u => u.is_bot && u.delete_at === 0);

      const analyticsMap: Record<string, number> = {};
      for (const a of analytics) analyticsMap[a.name] = a.value;

      return Response.json({
        system: {
          status: ping?.status ?? 'unknown',
          version: ping?.AndroidLatestVersion ?? 'unknown',
          post_count: analyticsMap.total_posts ?? 0,
          channel_count: analyticsMap.total_channels ?? 0,
          team_count: teams.length,
          file_count: analyticsMap.total_file_count ?? 0,
          daily_active_users: analyticsMap.daily_active_users ?? 0,
        },
        users: realUsers,
        bots,
        teams: teamStats,
      });
    }

    case 'channels': {
      const teamId = url.searchParams.get('teamId');
      if (!teamId) return Response.json({ error: 'teamId required' }, { status: 400 });
      const channels = await getChannelsForTeam(teamId);

      const withStats = await Promise.all(
        channels.filter(c => c.delete_at === 0).map(async (ch) => {
          const stats = await getChannelStats(ch.id);
          return { ...ch, member_count: stats?.member_count ?? 0 };
        })
      );

      return Response.json({ channels: withStats });
    }

    default:
      return Response.json({ error: 'Unknown resource' }, { status: 400 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return unauthorized();

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'deactivate_user': {
      const ok = await deactivateUser(body.userId);
      return Response.json({ success: ok });
    }
    case 'delete_channel': {
      const ok = await deleteChannel(body.channelId);
      return Response.json({ success: ok });
    }
    case 'create_channel': {
      const ch = await createChannel(body.teamId, body.name, body.displayName, body.type, body.purpose);
      return Response.json({ success: !!ch, channel: ch });
    }
    case 'delete_team': {
      const ok = await deleteTeam(body.teamId);
      return Response.json({ success: ok });
    }
    case 'post_message': {
      const ok = await postToChannelById(body.channelId, body.message);
      return Response.json({ success: ok });
    }
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }
};
