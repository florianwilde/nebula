# Vorlage: Aufgaben über GitHub-Issues

Dieser Abschnitt gehört in die `CLAUDE.md` eines Projekts, das an Nebula hängt. Er
sorgt dafür, dass Claude Code, auch in der Cloud, Aufgaben immer auf demselben Weg
anlegt und abarbeitet: über Issues im GitHub-Repository. Nebula ist dabei nur Zuschauer
und muss für Claude Code nicht erreichbar sein.

## Voraussetzungen in Nebula

Am Projekt (Projektdialog → Git):

1. Das GitHub-Repository als **führendes** Repository, mit einer Verbindung, deren Token
   *Issues: Read and write* hat.
2. **„Neue Issues automatisch als Aufgaben übernehmen“** an. Dann erscheinen Issues, die
   Claude Code anlegt, als Aufgaben.
3. **„Neue Aufgaben automatisch als Issue anlegen“** an. Dann sieht Claude Code
   Aufgaben, die du in Nebula erfasst, als Issue.
4. Optional ein **Webhook** (Git-Panel → „Webhook einrichten“, Events *Pushes* und
   *Issues*), damit es sofort geht statt beim nächsten Abgleich.

## Abschnitt für die CLAUDE.md

Ab hier kopieren:

```markdown
## Aufgaben

Aufgaben dieses Projekts sind GitHub-Issues in diesem Repository. Nebula
uebernimmt sie von dort und hakt sie ab, wenn das Issue geschlossen wird – es
gibt also keinen zweiten Ort, der gepflegt werden muss.

- **"Neue Aufgabe: …"** heisst: ein Issue anlegen (Titel knapp, im Rumpf das
  Warum und, falls bekannt, wo im Code es ansetzt). Nichts implementieren,
  ausser es ist ausdruecklich verlangt.
- **"Arbeite die offenen Aufgaben ab"** heisst: offene Issues lesen, ohne
  Label `nicht-claude`, aelteste zuerst. Je Issue ein eigener Branch und ein
  eigener Pull Request.
- Jeder Pull Request nennt sein Issue mit `Closes #<nummer>` im Rumpf. Erst
  der Merge schliesst das Issue – damit wird die Aufgabe in Nebula erledigt.
- Ist ein Issue unklar oder zu gross: nicht raten, sondern im Issue
  nachfragen bzw. Teilaufgaben als eigene Issues vorschlagen.
- Issues nie von Hand schliessen, um eine Aufgabe "abzuhaken" – sonst gilt in
  Nebula als erledigt, was nie gemergt wurde.
```

## Was dabei verloren geht

Nebula kennt *In Arbeit* und *Blockiert*, GitHub nur offen und geschlossen. Diese
Zwischenzustände bleiben in Nebula und kommen in GitHub nicht an. Das ist so gewollt,
siehe Abschnitt 4.6 in [FEATURES.md](../FEATURES.md).
