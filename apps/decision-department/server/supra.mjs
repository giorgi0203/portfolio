import { calculateSplit } from '../shared/split.mjs';
import {
  digest,
  fail,
  identifier,
  text,
  token,
  validToken,
} from './room-utils.mjs';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const ROOM_PATH =
  /^\/api\/supra\/rooms(?:\/([A-Za-z0-9_-]{32})(?:\/(join|claim))?)?$/u;

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(400, `${name} must be a whole number from ${min} to ${max}.`);
  return value;
}

function readReceipt(body) {
  const title = text(body.title, 80, 'Table title');
  const name = text(body.name, 32, 'Diner name');
  const feeMinor = integer(body.feeMinor, 0, 1_000_000, 'Fee in tetri');
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 60
  )
    fail(400, 'Enter between 1 and 60 receipt lines.');
  const items = body.items.map((item) => ({
    name: text(item?.name, 100, 'Dish name'),
    quantity: integer(item.quantity, 1, 99, 'Quantity'),
    unitMinor: integer(item.unitMinor, 1, 1_000_000, 'Unit price in tetri'),
  }));
  if (
    items.reduce(
      (sum, item) => sum + item.quantity * item.unitMinor,
      feeMinor,
    ) > 10_000_000
  )
    fail(400, 'Keep the table total at or below ₾100,000.');
  return { title, name, feeMinor, items };
}

export function createSupraRooms({ db, clock, maxRooms, transaction }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supra_rooms (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, fee_minor INTEGER NOT NULL,
      host_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS supra_expiry ON supra_rooms(expires);
    CREATE TABLE IF NOT EXISTS supra_people (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES supra_rooms(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS supra_people_room ON supra_people(room_id);
    CREATE TABLE IF NOT EXISTS supra_items (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES supra_rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_minor INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS supra_items_room ON supra_items(room_id);
    CREATE TABLE IF NOT EXISTS supra_claims (
      participant_id TEXT NOT NULL REFERENCES supra_people(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES supra_items(id) ON DELETE CASCADE, weight INTEGER NOT NULL,
      PRIMARY KEY(participant_id,item_id)
    );`);
  const query = (sql) => db.prepare(sql);
  const cleanup = () =>
    query('DELETE FROM supra_rooms WHERE expires<=?').run(clock());
  const roomRow = (id) => {
    const row = query('SELECT * FROM supra_rooms WHERE id=? AND expires>?').get(
      id,
      clock(),
    );
    if (!row) fail(404, 'Table not found or expired.');
    return row;
  };
  function publicRoom(id) {
    const row = roomRow(id);
    // Insertion order provides stable tie-breaking when people split one indivisible tetri.
    const participants = query(
      'SELECT id,name FROM supra_people WHERE room_id=? ORDER BY rowid',
    ).all(id);
    const items = query(
      'SELECT id,name,quantity,unit_minor AS unitMinor FROM supra_items WHERE room_id=? ORDER BY rowid',
    ).all(id);
    const claims =
      query(`SELECT c.item_id AS itemId,c.participant_id AS participantId,c.weight
      FROM supra_claims c JOIN supra_people p ON c.participant_id=p.id WHERE p.room_id=? ORDER BY c.rowid`).all(
        id,
      );
    return {
      id,
      title: row.title,
      feeMinor: row.fee_minor,
      hostId: row.host_id,
      created: row.created,
      expires: row.expires,
      revision: row.revision,
      items,
      participants,
      claims,
      totals: calculateSplit(items, participants, claims, row.fee_minor),
    };
  }
  function addParticipant(roomId, name, participantId = identifier()) {
    const participantToken = token();
    query(
      'INSERT INTO supra_people(id,room_id,token_hash,name) VALUES(?,?,?,?)',
    ).run(participantId, roomId, digest(participantToken), name);
    return { participantId, participantToken };
  }
  function participant(roomId, supplied) {
    const person =
      validToken(supplied) &&
      query('SELECT id FROM supra_people WHERE room_id=? AND token_hash=?').get(
        roomId,
        digest(supplied),
      );
    if (!person) fail(403, 'Join this table before making changes.');
    return person.id;
  }
  const changed = (id) =>
    query('UPDATE supra_rooms SET revision=revision+1 WHERE id=?').run(id);
  function handle(path, method, body, credential) {
    const match = path.match(ROOM_PATH);
    if (!match) fail(404, 'Table not found.');
    const [, id, action] = match;
    if (!id) {
      if (method !== 'POST')
        fail(405, 'Create a table or open an invite link.');
      const receipt = readReceipt(body);
      return transaction(() => {
        cleanup();
        if (query('SELECT count(*) AS n FROM supra_rooms').get().n >= maxRooms)
          fail(503, 'All tables are occupied. Try again later.');
        const roomId = identifier(24),
          hostId = identifier(),
          now = clock();
        query(
          'INSERT INTO supra_rooms(id,title,fee_minor,host_id,created,expires) VALUES(?,?,?,?,?,?)',
        ).run(roomId, receipt.title, receipt.feeMinor, hostId, now, now + WEEK);
        const diner = addParticipant(roomId, receipt.name, hostId);
        const insert = query(
          'INSERT INTO supra_items(id,room_id,name,quantity,unit_minor) VALUES(?,?,?,?,?)',
        );
        for (const item of receipt.items)
          insert.run(
            identifier(),
            roomId,
            item.name,
            item.quantity,
            item.unitMinor,
          );
        return { status: 201, body: { room: publicRoom(roomId), ...diner } };
      });
    }

    if (!action && method === 'GET')
      return { status: 200, body: { room: publicRoom(id) } };
    return transaction(() => {
      const row = roomRow(id);
      if (action === 'join' && method === 'POST') {
        const name = text(body.name, 32, 'Diner name');
        if (
          query('SELECT count(*) AS n FROM supra_people WHERE room_id=?').get(
            id,
          ).n >= 40
        )
          fail(409, 'This table already has 40 diners.');
        const diner = addParticipant(id, name);
        changed(id);
        return { status: 201, body: { room: publicRoom(id), ...diner } };
      }
      if (!action && method === 'DELETE') {
        if (participant(id, credential) !== row.host_id)
          fail(403, 'Only the host can delete this table.');
        query('DELETE FROM supra_rooms WHERE id=?').run(id);
        return { status: 200, body: { ok: true } };
      }
      if (action !== 'claim' || method !== 'PUT')
        fail(405, 'That method is not available.');
      const personId = participant(id, credential);
      const weight = integer(body.weight, 0, 100, 'Share weight');
      if (
        typeof body.itemId !== 'string' ||
        !query('SELECT id FROM supra_items WHERE id=? AND room_id=?').get(
          body.itemId,
          id,
        )
      )
        fail(400, 'Choose a dish from this table.');
      const result = weight
        ? query(`INSERT INTO supra_claims(participant_id,item_id,weight) VALUES(?,?,?)
          ON CONFLICT(participant_id,item_id) DO UPDATE SET weight=excluded.weight WHERE weight!=excluded.weight`).run(
            personId,
            body.itemId,
            weight,
          )
        : query(
            'DELETE FROM supra_claims WHERE participant_id=? AND item_id=?',
          ).run(personId, body.itemId);
      if (result.changes) changed(id);
      return { status: 200, body: { room: publicRoom(id) } };
    });
  }
  return { handle, cleanup };
}
