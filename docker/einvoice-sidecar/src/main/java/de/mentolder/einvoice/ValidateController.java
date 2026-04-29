package de.mentolder.einvoice;

import org.mustangproject.validator.ZUGFeRDValidator;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import java.nio.file.*;
import java.util.*;

@RestController
public class ValidateController {

  public record ValidateRequest(String pdf, String xml) {}
  public record ValidateResponse(boolean ok, List<String> errors, List<String> warnings, String reportXml) {}

  @PostMapping(value = "/validate",
               consumes = MediaType.APPLICATION_JSON_VALUE,
               produces = MediaType.APPLICATION_JSON_VALUE)
  public ValidateResponse validate(@RequestBody ValidateRequest req) throws Exception {
    boolean isPdf = req.pdf() != null;
    Path tmp = Files.createTempFile("einvoice-", isPdf ? ".pdf" : ".xml");
    try {
      byte[] payload = Base64.getDecoder().decode(isPdf ? req.pdf() : req.xml());
      Files.write(tmp, payload);
      ZUGFeRDValidator v = new ZUGFeRDValidator();
      String reportXml = v.validate(tmp.toString());
      boolean ok = !reportXml.contains("severity=\"3\"") && !reportXml.contains("severity=\"5\"");
      List<String> errors = extractMessages(reportXml, "error");
      List<String> warnings = extractMessages(reportXml, "warning");
      return new ValidateResponse(ok, errors, warnings, reportXml);
    } finally {
      Files.deleteIfExists(tmp);
    }
  }

  private List<String> extractMessages(String xml, String type) {
    List<String> out = new ArrayList<>();
    String marker = "<" + type + ">";
    int idx = 0;
    while ((idx = xml.indexOf(marker, idx)) != -1) {
      int end = xml.indexOf("</" + type + ">", idx);
      if (end < 0) break;
      out.add(xml.substring(idx + marker.length(), end));
      idx = end;
    }
    return out;
  }
}
