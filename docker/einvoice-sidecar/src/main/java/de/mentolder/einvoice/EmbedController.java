package de.mentolder.einvoice;

import org.mustangproject.ZUGFeRD.ZUGFeRDExporterFromA1;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import java.io.*;
import java.util.Base64;
import java.util.Map;

@RestController
public class EmbedController {

  public record EmbedRequest(String pdf, String xml) {}
  public record EmbedResponse(String pdf, Map<String, Object> meta) {}

  @PostMapping(value = "/embed",
               consumes = MediaType.APPLICATION_JSON_VALUE,
               produces = MediaType.APPLICATION_JSON_VALUE)
  public EmbedResponse embed(@RequestBody EmbedRequest req) throws Exception {
    byte[] pdfBytes = Base64.getDecoder().decode(req.pdf());
    byte[] xmlBytes = Base64.getDecoder().decode(req.xml());

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (var exporter = new ZUGFeRDExporterFromA1()
        .setProducer("mentolder-einvoice-sidecar")
        .setCreator("mentolder")
        .load(new ByteArrayInputStream(pdfBytes))) {
      exporter.setXML(xmlBytes);
      exporter.export(out);
    }
    byte[] pdfA3 = out.toByteArray();
    return new EmbedResponse(
      Base64.getEncoder().encodeToString(pdfA3),
      Map.of("size", pdfA3.length, "profile", "factur-x:EN 16931")
    );
  }
}
