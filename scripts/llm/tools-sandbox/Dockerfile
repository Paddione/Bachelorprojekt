# Laufzeit fuer die eingebauten llama-server-Tools (--tools-runtime).
#
# Warum ueberhaupt ein eigenes Image: llama.cpp fuehrt die Tools im Isolate als
# Shell-Kommandos aus — 'sh', 'cat', 'wc', 'mkdir', 'dirname' liefert busybox
# mit, ABER 'file_glob_search' ruft 'git ls-files --cached --others
# --exclude-standard' auf. Ohne git faellt genau dieses Tool aus, und zwar
# still: der Aufruf gibt einen Fehler an das Modell zurueck, der Server laeuft
# weiter. Deshalb git fest ins Image statt Alpine pur.
#
# Kein Compiler, kein Paketmanager-Cache, kein Netzwerk zur Laufzeit (das setzt
# tools-sandbox.sh mit --network none). Das Image ist bewusst klein: alles, was
# hier liegt, ist auch das, was ein Modell mit exec_shell_command erreichen kann.
FROM alpine:3.22

# git fuer file_glob_search, grep fuer grep_search (busybox-grep kennt kein -r
# mit denselben Schaltern), coreutils fuer ein vorhersagbares 'wc -c'.
RUN apk add --no-cache git grep coreutils \
 && adduser -D -u 65532 -h /home/tools tools \
 && git config --system --add safe.directory /workspace \
 && git config --system --add safe.directory '/workspace/*'

# safe.directory oben: der Container-User (65532) besitzt die gemounteten Dateien
# nicht — sie gehoeren dem Host-Benutzer. git verweigert dann jede Operation mit
# "detected dubious ownership", und 'file_glob_search' liefert nichts. Die
# Ausnahme ist hier unbedenklich: der Mount ist genau das Verzeichnis, das
# tools-sandbox.sh bewusst hineingibt, und mehr sieht der Container nicht.
#
# Nicht als root. Der Mount wird von tools-sandbox.sh passend gesetzt; ein
# Schreibzugriff ausserhalb davon scheitert am Dateisystem, nicht an Absicht.
USER tools
WORKDIR /workspace

# pid 1 blockiert auf stdin — llama.cpp haelt den Container ueber ein offenes
# stdin am Leben und 'docker exec't fuer jeden Toolaufruf hinein.
CMD ["sh"]
