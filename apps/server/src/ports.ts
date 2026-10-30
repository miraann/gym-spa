/** The ports one server uses. Postgres, Auth and PostgREST listen on 127.0.0.1 only. */
export interface StackPorts {
  readonly postgres: number;
  readonly auth: number;
  readonly rest: number;
  /** gym-server: the only port the app talks to. */
  readonly gateway: number;
}

/**
 * The development server's ports. Never 5432 or 54321-54329: those belong to a Postgres installed
 * on the PC and to the local Supabase in Docker, which run at the same time.
 */
export const DEV_PORTS: StackPorts = { postgres: 55432, auth: 55499, rest: 55430, gateway: 55421 };

/** The installed server's ports (`server.json` in its data folder may change them). */
export const SERVER_PORTS: StackPorts = {
  postgres: 47210,
  auth: 47211,
  rest: 47212,
  gateway: 47213,
};

/** HTTPS for the other PCs of the gym: the one port the firewall opens (TCP, private networks). */
export const LAN_PORT = 47200;
