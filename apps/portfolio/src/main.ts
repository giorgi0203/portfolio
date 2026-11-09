// The portfolio is a hub for independently deployed apps. Its own startup
// must not depend on a remote application's manifest or availability.
import('./bootstrap').catch((error) => console.error(error));
