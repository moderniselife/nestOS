import { checkPrivileges } from './utils/checkPrivileges.js';

// Check for root privileges before starting
checkPrivileges();

// Import and start the application
import('./index.js');