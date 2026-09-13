export async function fetchCityData(address){
  return {
    status:'PARTIAL',
    address,
    widmung:{status:'NOT_CONNECTED',widmung:null,bedeutung:null,klasse:null,bezirk:null,flaeche_m2:null},
    schutzzone:{status:'NOT_CONNECTED',schutzzone:null},
    bauperiode:{status:'NOT_CONNECTED',bauperiode:null,bauperiode2:null,bautyp:null},
    kurzparkzone:{status:'NOT_CONNECTED',bezirk:null,zeitraum:null,hoechstdauer:null,gueltigAb:null},
    grundstueck:{status:'NOT_CONNECTED',kg:null,gnr:null,ez:null,flaeche_m2:null}
  };
}
