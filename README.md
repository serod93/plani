# Plani

Planificador de talleres en el navegador: reparte el tiempo de un taller en una línea de tiempo editable, con fichas por módulo (descripción, responsable, recursos), y exporta a PDF, Excel o `.plani`.

**Sitio:** https://serod93.github.io/plani/

- Todo corre en tu navegador. No hay servidor ni cuentas: lo que planificas se guarda solo en tu navegador, en este dispositivo.
- Arrastra el borde de un módulo para cambiar su inicio o su término. Si choca con el vecino, la herramienta pregunta si recortar o desplazar el resto.
- **Guardar para Plani** descarga un archivo `.plani` (JSON legible) con lo editable; **Importar .plani** lo vuelve a abrir. También lo lee la app de Mac de Plani.
- Para conservar un taller, exporta el `.plani`: borrar los datos del sitio en el navegador borra el cronograma.

## Formato `.plani` (versión 1)

```json
{
  "formato": "plani", "version": 1, "creadoCon": "Plani web", "exportado": "2026-11-04T12:00:00Z",
  "taller": {
    "titulo": "…", "fecha": "2026-11-06", "inicio": 600, "termino": 840,
    "recursosTransversales": ["Proyector"],
    "modulos": [
      { "nombre": "…", "tipo": "expositiva|participativa|practica|pausa",
        "inicio": 600, "fin": 640, "descripcion": "…", "responsable": "…", "recursos": ["…"] }
    ]
  }
}
```

Las horas son minutos desde las 00:00. Los campos vacíos se omiten.
