/* Minimaler Testlauf im Browser. */
(function () {
  var tests = [];
  var LWTest = {
    test: function (name, fn) { tests.push({ name: name, fn: fn }); },
    eq: function (actual, expected, msg) {
      var a = JSON.stringify(actual), e = JSON.stringify(expected);
      if (a !== e) throw new Error((msg || 'eq') + ': erwartet ' + e + ', erhalten ' + a);
    },
    ok: function (cond, msg) {
      if (!cond) throw new Error(msg || 'Bedingung nicht erfüllt');
    },
    run: async function () {
      var pass = 0, fails = [];
      for (var i = 0; i < tests.length; i++) {
        try { await tests[i].fn(); pass++; }
        catch (err) { fails.push(tests[i].name + ' – ' + err.message); }
      }
      var el = document.getElementById('ergebnis');
      el.textContent = pass + ' bestanden, ' + fails.length + ' fehlgeschlagen';
      var ul = document.getElementById('fehler');
      fails.forEach(function (f) {
        var li = document.createElement('li');
        li.textContent = f;
        ul.appendChild(li);
      });
    }
  };
  window.LWTest = LWTest;
})();
