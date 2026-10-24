export type Lang = "es" | "en";

type Item = { v: string; l: string };

export type Copy = {
  badge: string;
  eyebrow: string;
  heroTitle: string;
  heroBody: string;
  stats: Item[];
  back: string;
  formEyebrow: string;
  loginTitle: string;
  loginSub: string;
  notice: string;
  forgotTitle: string;
  forgotSub: string;
  doneTitle: string;
  doneSub: (email: string) => string;
  email: string;
  password: string;
  forgot: string;
  show: string;
  hide: string;
  remember: string;
  enter: string;
  entering: string;
  or: string;
  sso: string;
  errEmpty: string;
  errDomain: string;
  errShort: string;
  sendLink: string;
  backLogin: string;
  forgotMsg: (email: string) => string;
  yourEmail: string;
  checks: Item[];
  logout: string;
  help: string;
  privacy: string;
  langLabel: string;
  errCredentials: string;
  errBanned: string;
  errRate: string;
  errNetwork: string;
  errWeak: string;
  errSame: string;
  errMismatch: string;
  errLink: string;
  errSso: string;
  errUnknown: string;
  setTitle: string;
  setSub: string;
  inviteTitle: string;
  inviteSub: string;
  newPassword: string;
  repeatPassword: string;
  savePassword: string;
  saving: string;
  sending: string;
  checkingTitle: string;
  checkingSub: string;
  roleTeam: string;
};

export const T: Record<Lang, Copy> = {
  es: {
    badge: "Solo equipo",
    eyebrow: "Plataforma interna · uso privado",
    heroTitle: "El panel de trabajo del equipo ChipsFinder",
    heroBody:
      "Herramienta privada para el personal: pedidos entrantes, búsqueda de referencias, proveedores y control de lotes. No es accesible para clientes ni proveedores.",
    stats: [
      { v: "Pedidos", l: "Entrantes" },
      { v: "Stock", l: "Referencias" },
      { v: "Lotes", l: "Control" },
    ],
    back: "Acceso interno",
    formEyebrow: "Personal autorizado",
    loginTitle: "Iniciar sesión",
    loginSub:
      "Solo para miembros del equipo con cuenta @chipsfinder.es. Las cuentas las da de alta un administrador.",
    notice:
      "Sistema privado de ChipsFinder. Los accesos quedan registrados. Si no formas parte del equipo, cierra esta página.",
    forgotTitle: "Recuperar acceso",
    forgotSub: "Te enviamos un enlace para crear una contraseña nueva.",
    doneTitle: "Sesión iniciada",
    doneSub: (e) => "Comprobaciones de seguridad superadas. Has entrado como " + e + ". Cargando el panel…",
    email: "Correo corporativo",
    password: "Contraseña",
    forgot: "¿La olvidaste?",
    show: "Ver",
    hide: "Ocultar",
    remember: "Mantener la sesión en este equipo",
    enter: "Entrar",
    entering: "Verificando…",
    or: "o",
    sso: "Entrar con Microsoft",
    errEmpty: "Escribe tu correo y tu contraseña.",
    errDomain: "Solo se admiten cuentas @chipsfinder.es.",
    errShort: "La contraseña tiene al menos 8 caracteres.",
    sendLink: "Enviar enlace",
    backLogin: "Volver a iniciar sesión",
    forgotMsg: (e) => "Si " + e + " tiene cuenta, en unos minutos recibirás el enlace.",
    yourEmail: "tu correo",
    checks: [
      { l: "Credenciales", v: "OK" },
      { l: "Dispositivo", v: "OK" },
      { l: "Permisos", v: "" },
    ],
    logout: "Cerrar sesión",
    help: "¿Eres del equipo y no tienes acceso? Pídelo al administrador en",
    privacy: "Uso interno · Confidencial",
    langLabel: "Idioma",
    errCredentials: "Correo o contraseña incorrectos.",
    errBanned: "Esta cuenta está desactivada. Habla con el administrador.",
    errRate: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    errNetwork: "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.",
    errWeak: "Esa contraseña es demasiado débil. Prueba con una más larga.",
    errSame: "La contraseña nueva tiene que ser distinta de la anterior.",
    errMismatch: "Las dos contraseñas no coinciden.",
    errLink: "El enlace ha caducado o ya se usó. Pide uno nuevo.",
    errSso: "No se pudo entrar con Microsoft.",
    errUnknown: "Algo ha fallado. Inténtalo de nuevo.",
    setTitle: "Nueva contraseña",
    setSub: "Elige una contraseña nueva de al menos 8 caracteres.",
    inviteTitle: "Crea tu contraseña",
    inviteSub: "Ya tienes cuenta en el panel del equipo. Elige una contraseña de al menos 8 caracteres para entrar.",
    newPassword: "Contraseña nueva",
    repeatPassword: "Repite la contraseña",
    savePassword: "Guardar y entrar",
    saving: "Guardando…",
    sending: "Enviando…",
    checkingTitle: "Comprobando acceso",
    checkingSub: "Un momento…",
    roleTeam: "EQUIPO",
  },
  en: {
    badge: "Team only",
    eyebrow: "Internal platform · private use",
    heroTitle: "The ChipsFinder team's workspace",
    heroBody:
      "Private tool for staff: incoming orders, part search, suppliers and batch control. Not accessible to clients or suppliers.",
    stats: [
      { v: "Orders", l: "Incoming" },
      { v: "Stock", l: "Parts" },
      { v: "Batches", l: "Control" },
    ],
    back: "Internal access",
    formEyebrow: "Authorised staff",
    loginTitle: "Sign in",
    loginSub:
      "Only for team members with an @chipsfinder.es account. Accounts are created by an administrator.",
    notice:
      "ChipsFinder private system. All access is logged. If you are not part of the team, close this page.",
    forgotTitle: "Recover access",
    forgotSub: "We will send you a link to set a new password.",
    doneTitle: "Signed in",
    doneSub: (e) => "Security checks passed. Signed in as " + e + ". Loading the dashboard…",
    email: "Corporate email",
    password: "Password",
    forgot: "Forgot it?",
    show: "Show",
    hide: "Hide",
    remember: "Keep me signed in on this device",
    enter: "Sign in",
    entering: "Verifying…",
    or: "or",
    sso: "Sign in with Microsoft",
    errEmpty: "Enter your email and password.",
    errDomain: "Only @chipsfinder.es accounts are allowed.",
    errShort: "Passwords are at least 8 characters.",
    sendLink: "Send link",
    backLogin: "Back to sign in",
    forgotMsg: (e) => "If " + e + " has an account, you will receive the link in a few minutes.",
    yourEmail: "your email",
    checks: [
      { l: "Credentials", v: "OK" },
      { l: "Device", v: "OK" },
      { l: "Permissions", v: "" },
    ],
    logout: "Sign out",
    help: "On the team but no access? Ask the administrator at",
    privacy: "Internal use · Confidential",
    langLabel: "Language",
    errCredentials: "Wrong email or password.",
    errBanned: "This account is disabled. Talk to the administrator.",
    errRate: "Too many attempts. Wait a few minutes and try again.",
    errNetwork: "Could not connect. Check your connection and try again.",
    errWeak: "That password is too weak. Try a longer one.",
    errSame: "The new password must be different from the old one.",
    errMismatch: "The two passwords do not match.",
    errLink: "This link has expired or was already used. Request a new one.",
    errSso: "Could not sign in with Microsoft.",
    errUnknown: "Something went wrong. Please try again.",
    setTitle: "New password",
    setSub: "Choose a new password of at least 8 characters.",
    inviteTitle: "Create your password",
    inviteSub: "You now have an account on the team dashboard. Choose a password of at least 8 characters to sign in.",
    newPassword: "New password",
    repeatPassword: "Repeat password",
    savePassword: "Save and sign in",
    saving: "Saving…",
    sending: "Sending…",
    checkingTitle: "Checking access",
    checkingSub: "One moment…",
    roleTeam: "TEAM",
  },
};
